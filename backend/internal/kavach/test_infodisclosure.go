package kavach

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// ─── Stack-trace marker probe ───────────────────────────────────────────
// Sends an intentionally garbled query string to the original endpoint and
// looks for stack-trace fingerprints in the response body. The point is to
// catch verbose error pages that leak file paths, ORM internals, or
// language stack frames.

type stacktraceMarker struct{}

func (stacktraceMarker) ID() string         { return "info.stacktrace_marker" }
func (stacktraceMarker) Name() string       { return "Stack trace leaks in error response" }
func (stacktraceMarker) Category() Category { return CatInfoDisclosure }

// Markers we look for. Cheap substring + lower-case match — false-positive
// risk is acceptable because the fix is "don't return stack traces" anyway.
var stackMarkers = []string{
	"traceback (most recent call last)",
	"at java.lang.",
	"at org.springframework.",
	"runtimeerror at",
	"system.exception",
	"goroutine 1 [running]",
	"\nat /", // node-style "at /app/server.js:123:45"
	"sequelize.errors.",
	"sqlalchemy.exc.",
	"laravel\\framework\\",
	"line 1, in <module>",
	"valueerror: ",
	"djangotemplates",
}

func (s stacktraceMarker) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	// Mutate the URL to inject a value almost guaranteed to confuse parsers
	// (mismatched brackets + a dummy SQL fragment) on a query parameter.
	mutated := mutateQueryParam(t.BaseRequest.URL, "kavach_probe", `]]'"})/*<!--`)
	probe := t.BaseRequest
	probe.URL = mutated
	target := t
	target.BaseRequest = probe

	resp, body, err := sendBase(ctx, target, hc, "")
	if err != nil {
		return nil
	}
	low := strings.ToLower(string(body))
	for _, m := range stackMarkers {
		if strings.Contains(low, m) {
			snip := excerptAround(string(body), m, 200)
			return []Finding{{
				TestID:   s.ID(),
				Category: s.Category(),
				Severity: SevHigh,
				Title:    "Server returned a stack trace under bad input",
				Description: "Sending a garbled query parameter triggered a verbose error page containing a recognisable stack-trace fingerprint (\"" + m + "\"). Internal file paths, framework names, and code structure are now visible to anyone who can reach the endpoint.",
				OWASP:       "API8:2023",
				CWE:         "CWE-209",
				Remediation: "Catch unhandled errors at the framework level and return a generic message (\"500 Internal Server Error\") in production. Log the trace server-side, never echo it to the client.",

				PlainTitle:          "Your server is showing internal error details to anyone",
				PlainWhatsHappening: "We sent your endpoint a deliberately weird query parameter. Instead of a clean 400 / 500, the server returned an error page that includes a stack trace — file paths, function names, and the framework you're running.",
				PlainWhy:            "An attacker uses these clues to map your codebase, look up your framework's known CVEs, and find the next thing to attack.",
				PlainHowToFix: []string{
					"Set your framework's debug / dev mode to OFF in production (Express: `NODE_ENV=production`; Django: `DEBUG=False`; Spring: omit `spring.profiles.active=dev`).",
					"Add a global error handler that logs the stack server-side and returns a generic JSON like `{\"error\":\"Internal server error\"}`.",
					"Cover the endpoint with an integration test that asserts the response body NEVER contains the words \"Traceback\", \"at java\", \"goroutine\", etc.",
				},
				Effort: Effort30Min,

				Request:      probe,
				Response:     snapshotResponse(resp, body),
				EvidenceText: "Marker: " + m + "\n\n" + snip,
			}}
		}
	}
	return nil
}

// ─── Sensitive-path probes (.git, .env, swagger, actuator) ──────────────
// We probe well-known sensitive paths at the *origin* root, not the
// supplied URL. If they exist with a 200 (or 401 with body content), that
// tells us the file is being served by the same host.

type sensitivePathProbe struct {
	id          string
	path        string
	severity    Severity
	title       string
	plainTitle  string
	plainWhy    string
	howToFix    []string
	contentHint string
	cwe         string
}

func (s sensitivePathProbe) ID() string         { return s.id }
func (s sensitivePathProbe) Name() string       { return s.title }
func (s sensitivePathProbe) Category() Category { return CatInfoDisclosure }

func (s sensitivePathProbe) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	probeURL := t.Origin + s.path
	req, err := http.NewRequestWithContext(ctx, "GET", probeURL, nil)
	if err != nil {
		return nil
	}
	resp, err := hc.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, MaxBodyBytes*2))

	if resp.StatusCode != 200 {
		return nil
	}
	if s.contentHint != "" && !strings.Contains(strings.ToLower(string(body)), s.contentHint) {
		// Some servers return 200 + an SPA index for everything. Hint check
		// is what tells us this is *actually* the sensitive file.
		return nil
	}

	probe := t.BaseRequest
	probe.URL = probeURL
	probe.Method = "GET"

	return []Finding{{
		TestID:   s.id,
		Category: s.Category(),
		Severity: s.severity,
		Title:    s.title,
		Description: "GET " + s.path + " returned 200. The file is publicly readable on the same host as your API, exposing data that should never be deployed.",
		OWASP:       "API8:2023",
		CWE:         s.cwe,
		Remediation: "Block " + s.path + " at the reverse proxy / CDN. Audit your build / deploy pipeline to make sure the file isn't being uploaded with your assets.",

		PlainTitle:          s.plainTitle,
		PlainWhatsHappening: "We requested `" + s.path + "` on your server and got a 200 response. That means the file is being served to anyone on the internet.",
		PlainWhy:            s.plainWhy,
		PlainHowToFix:       s.howToFix,
		Effort:              Effort5Min,

		Request:      probe,
		Response:     snapshotResponse(resp, body),
		EvidenceText: "GET " + s.path + " → " + resp.Status,
	}}
}

// ─── Stacktrace excerpt helper ──────────────────────────────────────────
func excerptAround(text, needle string, span int) string {
	idx := strings.Index(strings.ToLower(text), strings.ToLower(needle))
	if idx < 0 {
		return text
	}
	start := idx - span/2
	if start < 0 {
		start = 0
	}
	end := idx + span/2
	if end > len(text) {
		end = len(text)
	}
	return text[start:end]
}

// ─── Query-param mutator ────────────────────────────────────────────────
func mutateQueryParam(rawURL, key, value string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	q := u.Query()
	q.Set(key, value)
	u.RawQuery = q.Encode()
	return u.String()
}

// ─── Catalogue ──────────────────────────────────────────────────────────
func InfoDisclosureTests() []Test {
	return []Test{
		stacktraceMarker{},
		sensitivePathProbe{
			id: "info.dotgit", path: "/.git/HEAD", severity: SevMedium, cwe: "CWE-538",
			title:       "/.git/HEAD reachable",
			plainTitle:  "Your Git repository is on the internet",
			plainWhy:    "An attacker can clone your private source code straight off the production server. That includes your secrets, comments, and every commit you ever made.",
			contentHint: "ref: refs/heads/",
			howToFix: []string{
				"Add `location ~ /\\.git/ { deny all; }` to your nginx config (or equivalent in your reverse proxy).",
				"Audit your build pipeline — `.git/` should never be copied into a Docker image or static bucket.",
			},
		},
		sensitivePathProbe{
			id: "info.dotenv", path: "/.env", severity: SevHigh, cwe: "CWE-538",
			title:       "/.env reachable",
			plainTitle:  "Your environment file is downloadable from the public internet",
			plainWhy:    "Environment files contain database passwords, API keys, and secret tokens. If this returned 200, treat every secret in there as compromised.",
			contentHint: "=",
			howToFix: []string{
				"Block `.env` and other dotfiles at the reverse proxy.",
				"Rotate every credential that was in the file — assume it's leaked.",
				"Move secrets out of files into a secrets manager (AWS Secrets Manager, Vault, Kubernetes Secrets).",
			},
		},
		sensitivePathProbe{
			id: "info.swagger", path: "/swagger.json", severity: SevLow, cwe: "CWE-538",
			title:       "/swagger.json reachable",
			plainTitle:  "Public API documentation is live on production",
			plainWhy:    "Swagger / OpenAPI docs hand attackers a complete map of your API — every endpoint, parameter, and auth flow. Sometimes useful, often unintentional.",
			contentHint: "openapi",
			howToFix: []string{
				"If the docs are intentional, fine — make sure they don't list internal-only endpoints.",
				"If they're not intentional, gate them behind admin auth or a separate hostname.",
			},
		},
		sensitivePathProbe{
			id: "info.actuator", path: "/actuator", severity: SevMedium, cwe: "CWE-538",
			title:       "Spring /actuator reachable",
			plainTitle:  "Spring Boot operations endpoints are public",
			plainWhy:    "Actuator endpoints can leak environment variables, JVM internals, and (with the wrong config) allow remote code execution. Most prod deployments leave them open by accident.",
			contentHint: "_links",
			howToFix: []string{
				"Set `management.endpoints.web.exposure.include=health,info` to expose only the safe ones.",
				"Better: bind actuator to an internal port: `management.server.port=8081` and firewall it.",
			},
		},
	}
}
