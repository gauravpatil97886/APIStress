// Package tests holds the built-in Sentinel test catalogue. Each category
// lives in its own file; tests are tiny + self-contained — they take a
// Target + http.Client, fire the request, return zero-or-more Findings.
package kavach

import (
	"context"
	"io"
	"net/http"
	"strings"

	"github.com/choicetechlab/choicehammer/internal/engine"

)

// ─── Helper: clone the user's BaseRequest as a real *http.Request ──────
// All transport tests just hit the *original* URL and inspect the response
// — no payload mutation needed.
func sendBase(ctx context.Context, t Target, h *http.Client, methodOverride string) (*http.Response, []byte, error) {
	method := methodOverride
	if method == "" {
		method = t.BaseRequest.Method
		if method == "" {
			method = "GET"
		}
	}
	var body io.Reader
	if t.BaseRequest.Body != "" && method != http.MethodGet && method != http.MethodHead {
		body = strings.NewReader(t.BaseRequest.Body)
	}
	req, err := http.NewRequestWithContext(ctx, method, t.BaseRequest.URL, body)
	if err != nil {
		return nil, nil, err
	}
	for k, v := range t.BaseRequest.Headers {
		req.Header.Set(k, v)
	}
	resp, err := h.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, MaxBodyBytes*2))
	return resp, raw, nil
}

// snapshotResponse copies the response into Sentinel's persistable shape,
// truncating + redacting on the way through.
func snapshotResponse(resp *http.Response, body []byte) ResponseSnapshot {
	headers := make(map[string]string, len(resp.Header))
	for k, v := range resp.Header {
		headers[k] = strings.Join(v, ", ")
	}
	bodyStr := RedactBody(string(body))
	bodyStr, trunc := TruncateBody(bodyStr)
	return ResponseSnapshot{
		Status:    resp.StatusCode,
		Headers:   headers,
		Body:      bodyStr,
		BodyTrunc: trunc,
	}
}

// ─── Test: HSTS missing ────────────────────────────────────────────────
type hstsMissing struct{}

func (hstsMissing) ID() string                  { return "transport.hsts.missing" }
func (hstsMissing) Name() string                { return "HSTS header missing" }
func (hstsMissing) Category() Category { return CatTransport }

func (h hstsMissing) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	if !strings.HasPrefix(t.BaseRequest.URL, "https://") {
		// HSTS is meaningless over HTTP. Skip silently.
		return nil
	}
	resp, body, err := sendBase(ctx, t, hc, "")
	if err != nil {
		return nil
	}
	if v := resp.Header.Get("Strict-Transport-Security"); v != "" {
		return nil // present, healthy
	}
	return []Finding{{
		TestID:   h.ID(),
		Category: h.Category(),
		Severity: SevMedium,
		Title:    "HSTS header missing",
		Description: "The response does not include a Strict-Transport-Security header. " +
			"Browsers will accept downgrades to plain HTTP on the same host until the user manually types https://.",
		OWASP:       "API8:2023",
		CWE:         "CWE-319",
		Remediation: "Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` to every HTTPS response. " +
			"For sites that have been on HTTPS for at least 6 months, add the `preload` directive and submit to https://hstspreload.org.",

		PlainTitle:          "Browser doesn't know to stick to HTTPS",
		PlainWhatsHappening: "Your server uses HTTPS, but it never tells the browser \"always use HTTPS for me, never plain HTTP\". The first time someone types your hostname into the address bar without a scheme, the browser tries HTTP first.",
		PlainWhy:            "An attacker on the same Wi-Fi can intercept that first plain-HTTP request and serve a fake login page. The fix is one header.",
		PlainHowToFix: []string{
			"In your reverse proxy or framework, add the header `Strict-Transport-Security: max-age=31536000; includeSubDomains` to every response.",
			"Once you've been HTTPS-only for at least 6 months and all subdomains are HTTPS too, also add `; preload` and submit at hstspreload.org.",
		},
		Effort: Effort5Min,

		Request:      t.BaseRequest,
		Response:     snapshotResponse(resp, body),
		EvidenceText: "Strict-Transport-Security header was absent from response.",
	}}
}

// ─── Test: X-Content-Type-Options missing ──────────────────────────────
type xctoMissing struct{}

func (xctoMissing) ID() string                  { return "transport.xcontenttype.missing" }
func (xctoMissing) Name() string                { return "X-Content-Type-Options missing" }
func (xctoMissing) Category() Category { return CatTransport }

func (x xctoMissing) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	resp, body, err := sendBase(ctx, t, hc, "")
	if err != nil {
		return nil
	}
	v := resp.Header.Get("X-Content-Type-Options")
	if strings.EqualFold(v, "nosniff") {
		return nil
	}
	return []Finding{{
		TestID:      x.ID(),
		Category:    x.Category(),
		Severity:    SevLow,
		Title:       "X-Content-Type-Options: nosniff missing",
		Description: "Response does not pin the Content-Type for browser interpretation. Some legacy browsers will MIME-sniff and reinterpret the body, which can turn a benign response into executable script.",
		OWASP:       "API8:2023",
		CWE:         "CWE-693",
		Remediation: "Add `X-Content-Type-Options: nosniff` to every response.",

		PlainTitle:          "Browser may guess the wrong file type",
		PlainWhatsHappening: "Without this header, older browsers (and some misconfigured proxies) will look at the actual response bytes and guess the file type, ignoring what your Content-Type header says.",
		PlainWhy:            "If an attacker can upload a file that looks like an image but contains JavaScript, this guessing game could end with the browser running it as a script.",
		PlainHowToFix: []string{
			"Add `X-Content-Type-Options: nosniff` to every response.",
			"In Express: `app.use(helmet())`. In Spring: `.headers().contentTypeOptions()`. In Nginx: `add_header X-Content-Type-Options nosniff always;`.",
		},
		Effort: Effort5Min,

		Request:      t.BaseRequest,
		Response:     snapshotResponse(resp, body),
		EvidenceText: "Header X-Content-Type-Options was \"" + v + "\"; expected \"nosniff\".",
	}}
}

// ─── Test: X-Frame-Options missing ─────────────────────────────────────
type xfoMissing struct{}

func (xfoMissing) ID() string                  { return "transport.xframe.missing" }
func (xfoMissing) Name() string                { return "X-Frame-Options / frame-ancestors missing" }
func (xfoMissing) Category() Category { return CatTransport }

func (x xfoMissing) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	resp, body, err := sendBase(ctx, t, hc, "")
	if err != nil {
		return nil
	}
	xfo := resp.Header.Get("X-Frame-Options")
	csp := resp.Header.Get("Content-Security-Policy")
	if xfo != "" || strings.Contains(csp, "frame-ancestors") {
		return nil
	}
	return []Finding{{
		TestID:      x.ID(),
		Category:    x.Category(),
		Severity:    SevLow,
		Title:       "Page can be framed by any origin (clickjacking risk)",
		Description: "Neither X-Frame-Options nor a `frame-ancestors` directive in CSP was set, so any external site can iframe this response.",
		OWASP:       "API8:2023",
		CWE:         "CWE-1021",
		Remediation: "Set `X-Frame-Options: DENY` (or `SAMEORIGIN`) AND a CSP `frame-ancestors 'self'` directive — older browsers honour the former, modern ones the latter.",

		PlainTitle:          "Anyone can iframe this page",
		PlainWhatsHappening: "An attacker can put your page inside an invisible iframe on their site, then trick a logged-in user into clicking buttons that issue real requests on your service. This is called clickjacking.",
		PlainWhy:            "It's a one-line server change that defeats the entire technique.",
		PlainHowToFix: []string{
			"Add `X-Frame-Options: DENY` (or `SAMEORIGIN` if you intentionally embed your own pages).",
			"Also add `Content-Security-Policy: frame-ancestors 'self'` for browsers that ignore X-Frame-Options.",
		},
		Effort: Effort5Min,

		Request:      t.BaseRequest,
		Response:     snapshotResponse(resp, body),
		EvidenceText: "Both X-Frame-Options and CSP frame-ancestors were absent.",
	}}
}

// ─── Test: CORS wildcard with credentials (high severity) ──────────────
type corsWildcardCreds struct{}

func (corsWildcardCreds) ID() string                  { return "transport.cors.wildcard_with_creds" }
func (corsWildcardCreds) Name() string                { return "CORS misconfiguration: * with credentials" }
func (corsWildcardCreds) Category() Category { return CatTransport }

func (c corsWildcardCreds) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	// Probe with an attacker-shaped Origin to see how the server replies.
	probe := t.BaseRequest
	if probe.Headers == nil {
		probe.Headers = map[string]string{}
	} else {
		// Clone so we don't mutate the shared base.
		nh := make(map[string]string, len(probe.Headers)+1)
		for k, v := range probe.Headers {
			nh[k] = v
		}
		probe.Headers = nh
	}
	probe.Headers["Origin"] = "https://attacker.example.com"
	target := t
	target.BaseRequest = probe

	resp, body, err := sendBase(ctx, target, hc, "")
	if err != nil {
		return nil
	}
	allowOrigin := resp.Header.Get("Access-Control-Allow-Origin")
	allowCreds := strings.EqualFold(resp.Header.Get("Access-Control-Allow-Credentials"), "true")

	// Dangerous: ACAO reflects attacker origin AND credentials are allowed.
	if (allowOrigin == "https://attacker.example.com" || allowOrigin == "*") && allowCreds {
		return []Finding{{
			TestID:      c.ID(),
			Category:    c.Category(),
			Severity:    SevHigh,
			Title:       "CORS allows credentialed cross-origin requests from attacker origins",
			Description: "The server reflects an arbitrary Origin into Access-Control-Allow-Origin while also setting Access-Control-Allow-Credentials: true. An attacker site can make authenticated XHR/fetch requests on behalf of a logged-in user.",
			OWASP:       "API8:2023",
			CWE:         "CWE-942",
			Remediation: "Maintain an explicit allow-list of origins on the server, and only echo Origin back if it appears in the list. Never combine `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials: true`.",

			PlainTitle:          "Other websites can act as your logged-in user",
			PlainWhatsHappening: "When we sent a request claiming to come from `attacker.example.com`, your server told the browser \"yes, that origin is allowed AND it can send cookies\". Any malicious site can now make logged-in API calls on behalf of any user who visits them.",
			PlainWhy:            "This is one of the highest-impact CORS bugs — it bypasses the same-origin policy entirely for authenticated routes.",
			PlainHowToFix: []string{
				"Replace any \"reflect the Origin header\" CORS code with a strict allow-list of trusted origins.",
				"If credentials genuinely must cross origins, never wildcard. Echo only origins from the list.",
				"For public APIs that don't need cookies, drop the `Access-Control-Allow-Credentials` header entirely.",
			},
			Effort: Effort30Min,

			Request:      probe,
			Response:     snapshotResponse(resp, body),
			EvidenceText: "Sent Origin: https://attacker.example.com → Access-Control-Allow-Origin: " + allowOrigin + " | Access-Control-Allow-Credentials: " + resp.Header.Get("Access-Control-Allow-Credentials"),
		}}
	}
	return nil
}

// ─── Test: Server header leak ──────────────────────────────────────────
type serverHeaderLeak struct{}

func (serverHeaderLeak) ID() string                  { return "transport.server_header_leak" }
func (serverHeaderLeak) Name() string                { return "Server / X-Powered-By header reveals stack" }
func (serverHeaderLeak) Category() Category { return CatTransport }

func (s serverHeaderLeak) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	resp, body, err := sendBase(ctx, t, hc, "")
	if err != nil {
		return nil
	}
	leaked := []string{}
	for _, h := range []string{"Server", "X-Powered-By", "X-AspNet-Version", "X-AspNetMvc-Version"} {
		v := resp.Header.Get(h)
		if v == "" {
			continue
		}
		// "nginx" alone is uninformative; flag only when version-ish info present.
		if strings.ContainsAny(v, "0123456789") || strings.Contains(strings.ToLower(v), "express") {
			leaked = append(leaked, h+": "+v)
		}
	}
	if len(leaked) == 0 {
		return nil
	}
	return []Finding{{
		TestID:      s.ID(),
		Category:    s.Category(),
		Severity:    SevInfo,
		Title:       "Server stack version is leaked in response headers",
		Description: "Response headers reveal the underlying server software / framework versions: " + strings.Join(leaked, " | ") + ". This isn't a vulnerability on its own but lets attackers narrow exploit selection when a CVE drops.",
		OWASP:       "API8:2023",
		CWE:         "CWE-200",
		Remediation: "Strip / redact the Server, X-Powered-By, and version-disclosing headers at the edge (load balancer, reverse proxy, framework config).",

		PlainTitle:          "Your response headers tell attackers your tech stack",
		PlainWhatsHappening: "The response includes headers like " + strings.Join(leaked, ", ") + " that reveal the exact software + version running on your server.",
		PlainWhy:            "When a vulnerability is announced for that exact version, attackers grep the internet for headers like yours. It's not a hole on its own, but it puts you at the top of every scanner's hit-list.",
		PlainHowToFix: []string{
			"In Express: `app.disable(\"x-powered-by\")`.",
			"In Nginx: `server_tokens off;` and `proxy_hide_header X-Powered-By;`.",
			"In Spring Boot: `server.server-header=` (empty).",
		},
		Effort: Effort5Min,

		Request:      t.BaseRequest,
		Response:     snapshotResponse(resp, body),
		EvidenceText: strings.Join(leaked, " | "),
	}}
}

// All returns the transport-category test instances.
func TransportTests() []Test {
	return []Test{
		hstsMissing{}, xctoMissing{}, xfoMissing{}, corsWildcardCreds{}, serverHeaderLeak{},
	}
}

// Ensure unused-import suppression — engine.HTTPRequest is referenced via
// Target only, but we keep the import to make the link explicit
// for future tests that mutate request bodies.
var _ = engine.HTTPRequest{}
