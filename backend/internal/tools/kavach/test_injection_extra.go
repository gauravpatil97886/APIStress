package kavach

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/choicetechlab/choicehammer/internal/tools/apistress/engine"
)

// ─── Boolean-based blind SQL injection ─────────────────────────────────
// Fires three requests at the same parameter — a TRUE tautology, a FALSE
// tautology, and a control. If the TRUE response is significantly larger
// than the FALSE one (and different from control), the parameter is being
// injected into a WHERE clause.
type sqliBoolean struct{}

func (sqliBoolean) ID() string         { return "injection.sqli.boolean_blind" }
func (sqliBoolean) Name() string       { return "Boolean-based blind SQL injection" }
func (sqliBoolean) Category() Category { return CatInjection }

func (s sqliBoolean) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	control := t
	control.BaseRequest = withQuery(t.BaseRequest, "id", "1")
	probeT := t
	probeT.BaseRequest = withQuery(t.BaseRequest, "id", "1' OR '1'='1")
	probeF := t
	probeF.BaseRequest = withQuery(t.BaseRequest, "id", "1' AND '1'='2")

	_, cBody, err := sendBase(ctx, control, hc, "")
	if err != nil {
		return nil
	}
	tResp, tBody, err := sendBase(ctx, probeT, hc, "")
	if err != nil {
		return nil
	}
	fResp, fBody, err := sendBase(ctx, probeF, hc, "")
	if err != nil {
		return nil
	}

	// Heuristic: TRUE branch and CONTROL similar in size (within 20%) and
	// FALSE branch markedly different (>30% smaller / status changed).
	// Both branches must NOT 4xx — we want them to "succeed".
	if tResp.StatusCode >= 400 || fResp.StatusCode >= 400 {
		return nil
	}
	cLen, tLen, fLen := len(cBody), len(tBody), len(fBody)
	if tLen == 0 || fLen == 0 {
		return nil
	}
	closeToControl := absDiff(cLen, tLen)*5 < cLen+tLen // within ~20%
	farFromTrue := absDiff(tLen, fLen)*5 > tLen+fLen     // >20% diff
	if closeToControl && farFromTrue {
		return []Finding{{
			TestID:   s.ID(),
			Category: s.Category(),
			Severity: SevCritical,
			Title:    "Probable boolean-based blind SQL injection",
			Description: "Injecting `' OR '1'='1` and `' AND '1'='2` into the same parameter produced different-sized responses (control " +
				intToStr(cLen) + "B, TRUE " + intToStr(tLen) + "B, FALSE " + intToStr(fLen) + "B). The TRUE-tautology response is close to the control, the FALSE one is markedly different — classic blind-SQLi fingerprint.",
			OWASP:       "API8:2023",
			CWE:         "CWE-89",
			Remediation: "Switch the database call to parameterised binding so user input is treated as a value, not as SQL. After fixing, the FALSE / TRUE / control responses should all have the same shape.",

			PlainTitle:          "SQL injection: your code is treating user input as SQL",
			PlainWhatsHappening: "We sent two carefully crafted versions of the same parameter — one that should be 'always true', one that should be 'always false'. Your server returned different amounts of data for each. That only happens when the parameter is being interpolated into a SQL WHERE clause.",
			PlainWhy:            "Even though no error message leaked, an attacker can extract data one bit at a time using this size-difference signal. Hours later, they have your full database.",
			PlainHowToFix: []string{
				"Find the database call that uses this parameter and switch to parameterised binding (placeholders like `?`, `$1`, or named parameters).",
				"Never concatenate user input into SQL strings.",
				"Re-run this scan after the fix to confirm all three responses now match.",
			},
			Effort: Effort30Min,

			Request:      probeT.BaseRequest,
			Response:     snapshotResponse(tResp, tBody),
			EvidenceText: "Control len=" + intToStr(cLen) + " / TRUE len=" + intToStr(tLen) + " / FALSE len=" + intToStr(fLen),
		}}
	}
	return nil
}

// ─── Time-based blind SQL injection ────────────────────────────────────
type sqliTimeBlind struct{}

func (sqliTimeBlind) ID() string         { return "injection.sqli.time_blind" }
func (sqliTimeBlind) Name() string       { return "Time-based blind SQL injection" }
func (sqliTimeBlind) Category() Category { return CatInjection }

func (s sqliTimeBlind) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	// Baseline timing.
	t0 := time.Now()
	if _, _, err := sendBase(ctx, t, hc, ""); err != nil {
		return nil
	}
	baseline := time.Since(t0)
	if baseline > 4*time.Second {
		return nil
	}
	// Probe with `'; SELECT pg_sleep(4)--` and MySQL-style fallback.
	probe := t
	probe.BaseRequest = withQuery(t.BaseRequest, "id", "1';SELECT pg_sleep(4)--")
	t1 := time.Now()
	resp, body, err := sendBase(ctx, probe, hc, "")
	if err != nil {
		return nil
	}
	delta := time.Since(t1) - baseline
	if delta < 3*time.Second {
		// Try MySQL form if Postgres didn't bite.
		probe.BaseRequest = withQuery(t.BaseRequest, "id", "1' AND SLEEP(4)-- ")
		t2 := time.Now()
		resp, body, err = sendBase(ctx, probe, hc, "")
		if err != nil {
			return nil
		}
		delta = time.Since(t2) - baseline
		if delta < 3*time.Second {
			return nil
		}
	}
	return []Finding{{
		TestID:   s.ID(),
		Category: s.Category(),
		Severity: SevCritical,
		Title:    "Probable time-based blind SQL injection",
		Description: "A SLEEP / pg_sleep payload caused ~" + delta.Truncate(100*time.Millisecond).String() + " of additional latency vs the baseline (" + baseline.String() + "). The query parameter is being interpolated into SQL — the database is honouring our delay request.",
		OWASP:       "API8:2023",
		CWE:         "CWE-89",
		Remediation: "Switch to parameterised binding for every database call that uses this parameter.",

		PlainTitle:          "SQL injection: your database ran our SLEEP command",
		PlainWhatsHappening: "We added a `SLEEP(4)` payload to the parameter. The response took 4 seconds longer than usual — proving the database executed our payload as a SQL fragment.",
		PlainWhy:            "Even with no visible response difference, an attacker extracts bytes one at a time using timing as the signal. Slow but reliable; hard to notice in logs.",
		PlainHowToFix: []string{
			"Audit the code path that handles this parameter.",
			"Replace any string concatenation with parameterised binding (`$1`, `?`, `@id`, etc).",
			"Add an integration test that asserts a payload like `'; SELECT pg_sleep(2)--` returns within 1 second.",
		},
		Effort: Effort30Min,

		Request:      probe.BaseRequest,
		Response:     snapshotResponse(resp, body),
		EvidenceText: "Baseline " + baseline.String() + " · Probe " + (baseline + delta).String() + " · Δ " + delta.String(),
	}}
}

// ─── Path traversal probe ──────────────────────────────────────────────
type pathTraversal struct{}

func (pathTraversal) ID() string         { return "injection.path_traversal" }
func (pathTraversal) Name() string       { return "Path traversal in query / body" }
func (pathTraversal) Category() Category { return CatInjection }

func (p pathTraversal) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	// Mutate likely file-path parameters with classic Linux + Windows
	// traversals; look for marker strings unique to /etc/passwd and
	// Windows hosts file.
	keys := []string{"file", "path", "name", "filename", "doc", "page", "include", "template"}
	payloads := []string{"../../../../etc/passwd", "..%2f..%2f..%2fetc%2fpasswd", "....//....//etc/passwd"}
	markers := []string{"root:x:0:0", "root:!:0:0", "[boot loader]"}
	for _, k := range keys {
		for _, payload := range payloads {
			probe := t
			probe.BaseRequest = withQuery(t.BaseRequest, k, payload)
			resp, body, err := sendBase(ctx, probe, hc, "")
			if err != nil || resp.StatusCode != 200 {
				continue
			}
			for _, m := range markers {
				if strings.Contains(string(body), m) {
					return []Finding{{
						TestID:   p.ID(),
						Category: p.Category(),
						Severity: SevCritical,
						Title:    "Path traversal — server returned /etc/passwd",
						Description: "Setting `?" + k + "=" + payload + "` returned a response containing the marker `" + m + "`. The server is reading a file path from user input without validation, letting us escape the intended directory.",
						OWASP:       "API8:2023",
						CWE:         "CWE-22",
						Remediation: "Resolve the supplied filename against an allow-list. Use the language's path-canonicalisation helper (Node `path.resolve`, Go `filepath.Clean`+prefix check, Python `os.path.realpath`) and reject anything that escapes the base directory.",

						PlainTitle:          "Path traversal: anyone can read any file your server can read",
						PlainWhatsHappening: "We set the `" + k + "` parameter to `" + payload + "`. Your server interpreted it as a file path and returned the contents of `/etc/passwd` — a system file from the host. That means an attacker can read any file the web process has access to.",
						PlainWhy:            "Source code, config files, secrets, SSH keys — all potentially readable by sending the right path. CRITICAL — fix today.",
						PlainHowToFix: []string{
							"Find the code that reads files based on this parameter.",
							"Resolve the path against a base directory and reject anything outside it (`if !strings.HasPrefix(resolved, baseDir) reject`).",
							"Even better: don't accept file paths at all. Use database IDs that map to filenames server-side.",
						},
						Effort: Effort30Min,

						Request:      probe.BaseRequest,
						Response:     snapshotResponse(resp, body),
						EvidenceText: "Param `" + k + "=" + payload + "` → marker `" + m + "` in response body.",
					}}
				}
			}
		}
	}
	return nil
}

// ─── SSRF probe ────────────────────────────────────────────────────────
// If a parameter looks like a URL holder (`url`, `target`, `next`,
// `redirect`, `webhook`, `image_url`), point it at the AWS instance
// metadata IP. If the server fetches it and reflects metadata-shape
// content (`iam/`, `latest/`, etc.) we've found SSRF.
type ssrfMetadata struct{}

func (ssrfMetadata) ID() string         { return "injection.ssrf.metadata" }
func (ssrfMetadata) Name() string       { return "SSRF — internal metadata service" }
func (ssrfMetadata) Category() Category { return CatInjection }

func (s ssrfMetadata) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	keys := []string{"url", "target", "next", "redirect", "redirect_to", "return", "return_to", "webhook", "image_url", "callback", "feed", "rss"}
	payloads := []string{
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]:80/",
		"http://localhost:80/",
	}
	markers := []string{
		"ami-id", "instance-id", "iam/", "security-credentials", // AWS metadata
	}
	for _, k := range keys {
		// Only probe if the original URL has the parameter, OR if it was
		// part of the body we'd recognise.
		u := t.BaseRequest.URL
		if !strings.Contains(u, "?"+k+"=") && !strings.Contains(u, "&"+k+"=") {
			// Try injecting it anyway — if the param wasn't there, the
			// server will likely ignore it. But it's a cheap probe.
		}
		for _, payload := range payloads {
			probe := t
			probe.BaseRequest = withQuery(t.BaseRequest, k, payload)
			resp, body, err := sendBase(ctx, probe, hc, "")
			if err != nil {
				continue
			}
			low := strings.ToLower(string(body))
			for _, m := range markers {
				if strings.Contains(low, m) {
					return []Finding{{
						TestID:   s.ID(),
						Category: s.Category(),
						Severity: SevCritical,
						Title:    "SSRF — server fetched the cloud metadata service",
						Description: "Pointing the `" + k + "` parameter at " + payload + " caused a response containing AWS-metadata-shape content (\"" + m + "\"). The server is fetching attacker-controlled URLs without restricting the network destination.",
						OWASP:       "API7:2023",
						CWE:         "CWE-918",
						Remediation: "Maintain an allow-list of permitted outbound destinations. Reject any URL whose resolved IP falls in the link-local / loopback / RFC1918 ranges. Use a dedicated outbound proxy if you must let users supply URLs.",

						PlainTitle:          "Server can be tricked into fetching internal URLs (SSRF)",
						PlainWhatsHappening: "We told your server to fetch `" + payload + "` (an internal cloud metadata IP). It complied — and the response leaked metadata. That same trick gets attackers your AWS credentials, lets them scan your VPC, etc.",
						PlainWhy:            "SSRF is one of the highest-impact API bugs. AWS / GCP / Azure metadata gives credentials. Internal service probes find unauthenticated admin endpoints.",
						PlainHowToFix: []string{
							"Resolve the user-supplied URL DNS-side; reject if the IP is in 127.0.0.0/8, 169.254.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.",
							"Force IMDSv2 on AWS so the metadata service requires a token (and don't echo it back to clients).",
							"Use a dedicated egress proxy that only allows specific external destinations.",
						},
						Effort: EffortSprint,

						Request:      probe.BaseRequest,
						Response:     snapshotResponse(resp, body),
						EvidenceText: "Marker `" + m + "` after fetching `" + payload + "`.",
					}}
				}
			}
		}
	}
	return nil
}

// ─── Open-redirect probe ──────────────────────────────────────────────
type openRedirect struct{}

func (openRedirect) ID() string         { return "injection.open_redirect" }
func (openRedirect) Name() string       { return "Open redirect via user-supplied URL" }
func (openRedirect) Category() Category { return CatInjection }

func (o openRedirect) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	// Only meaningful for redirect-shape parameters.
	keys := []string{"redirect", "redirect_to", "return", "return_to", "next", "url", "destination", "continue", "rurl"}
	payload := "https://kavach-attacker.example.com/"
	for _, k := range keys {
		probe := t
		probe.BaseRequest = withQuery(t.BaseRequest, k, payload)
		resp, body, err := sendBase(ctx, probe, hc, "")
		if err != nil {
			continue
		}
		// 30x with Location header pointing at our payload domain.
		if resp.StatusCode >= 300 && resp.StatusCode < 400 {
			loc := resp.Header.Get("Location")
			if strings.Contains(strings.ToLower(loc), "kavach-attacker.example.com") {
				return []Finding{{
					TestID:   o.ID(),
					Category: o.Category(),
					Severity: SevHigh,
					Title:    "Open redirect — attacker-controlled URL accepted",
					Description: "Setting `?" + k + "=" + payload + "` produced a 30x response with `Location: " + loc + "`. The server redirects users to any URL supplied as a parameter — useful for phishing campaigns that look like they come from your domain.",
					OWASP:       "API8:2023",
					CWE:         "CWE-601",
					Remediation: "Restrict the redirect target to a per-app allow-list (or to relative paths only). Reject anything starting with `//` or with a non-allow-listed host.",

					PlainTitle:          "Your URL can phish your own users",
					PlainWhatsHappening: "We sent a request with `" + k + "=" + payload + "`. Your server responded \"go to that URL\" — meaning a phishing email saying \"click https://yoursite.com/login?" + k + "=https://attacker.com\" will redirect to attacker.com after going through your trusted hostname.",
					PlainWhy:            "Even though the bug is on your domain, the *user* sees \"yoursite.com\" in the link and trusts it. Open redirects are the staple of phishing campaigns.",
					PlainHowToFix: []string{
						"Treat user-supplied redirect URLs as paths only — strip everything but the path component.",
						"Or maintain an explicit allow-list of redirect destinations.",
						"Show an interstitial page if you must redirect to external URLs (\"You're leaving yoursite.com — continue?\").",
					},
					Effort: Effort30Min,

					Request:      probe.BaseRequest,
					Response:     snapshotResponse(resp, body),
					EvidenceText: "Param `" + k + "=" + payload + "` → " + resp.Status + " · Location: " + loc,
				}}
			}
		}
	}
	return nil
}

// ─── HTTP Parameter Pollution (HPP) ────────────────────────────────────
type hppDuplicate struct{}

func (hppDuplicate) ID() string         { return "injection.hpp" }
func (hppDuplicate) Name() string       { return "HTTP parameter pollution" }
func (hppDuplicate) Category() Category { return CatInjection }

func (h hppDuplicate) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	// Send the same parameter twice with conflicting values; check whether
	// the response materially changes vs a single-value baseline. Only
	// fires when we have an existing query parameter to duplicate.
	if !strings.Contains(t.BaseRequest.URL, "?") {
		return nil
	}
	// Pick the first parameter name from the URL.
	q := t.BaseRequest.URL[strings.Index(t.BaseRequest.URL, "?")+1:]
	parts := strings.SplitN(q, "&", 2)
	if len(parts) == 0 {
		return nil
	}
	kv := strings.SplitN(parts[0], "=", 2)
	if len(kv) != 2 || kv[0] == "" {
		return nil
	}
	key := kv[0]
	// Baseline.
	bResp, _, err := sendBase(ctx, t, hc, "")
	if err != nil {
		return nil
	}
	// Probe: append the same key with a different value.
	probe := t
	probe.BaseRequest.URL = t.BaseRequest.URL + "&" + key + "=kavach_probe"
	pResp, body, err := sendBase(ctx, probe, hc, "")
	if err != nil {
		return nil
	}
	// We flag only if the duplicated request changes status — most
	// well-behaved frameworks ignore the duplicate or use one consistently.
	// A status flip suggests inconsistent parameter parsing.
	if pResp.StatusCode != bResp.StatusCode && pResp.StatusCode < 500 {
		return []Finding{{
			TestID:   h.ID(),
			Category: h.Category(),
			Severity: SevMedium,
			Title:    "HTTP parameter pollution changes server behaviour",
			Description: "Sending the parameter `" + key + "` twice with different values changed the response status (" + bResp.Status + " → " + pResp.Status + "). Different layers (WAF / framework / app) likely parse duplicates differently — an attacker can use this gap to bypass filters.",
			OWASP:       "API8:2023",
			CWE:         "CWE-235",
			Remediation: "Reject duplicate parameters at the framework level, or normalise to first-value-only before any auth / validation. Make sure your WAF and your app see the same value.",

			PlainTitle:          "Duplicate parameters are parsed inconsistently",
			PlainWhatsHappening: "When we sent `" + key + "=A&" + key + "=kavach_probe`, your server responded differently to a single-value request. That means somewhere in your stack, duplicate parameters are read as the first value, somewhere else as the last — inconsistent parsing.",
			PlainWhy:            "An attacker uses this gap to bypass filters: the WAF sees one value, your code sees another.",
			PlainHowToFix: []string{
				"At the framework level, reject duplicate parameters or always take the first occurrence.",
				"In Express: prefer `req.query` defaults; in Spring: `@RequestParam` reads the first, audit any custom parsing.",
			},
			Effort: Effort30Min,

			Request:      probe.BaseRequest,
			Response:     snapshotResponse(pResp, body),
			EvidenceText: "Single: " + bResp.Status + " · Duplicated: " + pResp.Status,
		}}
	}
	return nil
}

// ─── Helpers ───────────────────────────────────────────────────────────

// withQuery sets ?key=value on the request URL, preserving the rest. We
// re-implement instead of importing net/url here to keep this file
// self-contained (mutateQueryParam in test_infodisclosure.go does the same
// thing — left there to keep blast radius small if we ever change shape).
func withQuery(req engine.HTTPRequest, key, value string) engine.HTTPRequest {
	out := req
	out.URL = mutateQueryParam(req.URL, key, value)
	return out
}

func absDiff(a, b int) int {
	if a > b {
		return a - b
	}
	return b - a
}

// ─── Catalogue extension ───────────────────────────────────────────────
// Appended to the existing InjectionTests slice via catalog.go init.
func InjectionExtraTests() []Test {
	return []Test{
		sqliBoolean{},
		sqliTimeBlind{},
		pathTraversal{},
		ssrfMetadata{},
		openRedirect{},
		hppDuplicate{},
	}
}
