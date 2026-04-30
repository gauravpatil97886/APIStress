package kavach

// TestExplanations is a `test_id → plain-English description` map of WHAT
// each test actually does — the attack mechanic in one paragraph. The
// frontend Report drawer surfaces this in a "What we tried" tab; the PDF
// renders it under each finding card.
//
// Keep entries short (1–3 sentences) and concrete: state the payload, the
// fingerprint we look for, and which axis of the request we mutate.
var TestExplanations = map[string]string{
	// Transport
	"transport.hsts.missing":              "We made the same request your users would, then checked whether the response carries a `Strict-Transport-Security` header. Missing on an HTTPS endpoint = browsers can be downgraded to HTTP on a return visit.",
	"transport.csp.missing":               "We probed the response for `Content-Security-Policy`. CSP tells the browser which scripts/iframes/origins are allowed — without it, an XSS injection has the full set of script capabilities.",
	"transport.xframe.missing":            "We checked for `X-Frame-Options` AND a `frame-ancestors` directive in CSP. If neither is present, your page can be iframed by any attacker site (clickjacking).",
	"transport.xcontenttype.missing":      "We looked for `X-Content-Type-Options: nosniff`. Without it, legacy browsers MIME-sniff the body and can re-interpret a benign response as a script.",
	"transport.cors.wildcard_with_creds":  "We sent the request again with `Origin: https://attacker.example.com`. If the server responds `Access-Control-Allow-Origin: <attacker>` AND `Access-Control-Allow-Credentials: true`, any external site can make logged-in calls on behalf of your users.",
	"transport.server_header_leak":        "We scanned the response headers for `Server`, `X-Powered-By`, `X-AspNet-Version` etc. with version numbers. These hand attackers your stack version when a CVE drops.",

	// Info disclosure
	"info.stacktrace_marker":              "We injected a deliberately mangled query string (`]]'\"})/*<!--`) into the request and looked for stack-trace markers in the response (Traceback, java.lang, goroutine 1 [running], etc). Visible stack traces in error pages reveal your framework version, file paths, and code structure.",
	"info.dotgit":                         "We performed a GET on `/.git/HEAD` at the host. If the server returned 200 with the literal `ref: refs/heads/...` content, your Git repo is on the public internet — attackers can clone the entire repo.",
	"info.dotenv":                         "We performed a GET on `/.env`. A 200 with `KEY=value` shaped content means your environment file with secrets is downloadable by anyone.",
	"info.swagger":                        "We performed a GET on `/swagger.json`. A 200 with OpenAPI content tells us your full API map (every endpoint, parameter, and auth flow) is publicly documented — sometimes intentional, often not.",
	"info.actuator":                       "We performed a GET on `/actuator`. Spring Boot management endpoints often expose env variables, JVM internals, or even allow remote actions if misconfigured.",

	// Injection — original
	"injection.sqli.quote_break":          "We injected `1'\"` into a query parameter and watched the response for SQL error markers (`SQLSTATE`, `syntax error`, `unclosed quotation`, `ORA-`, `pg_query`). A leaked SQL error proves our input is being concatenated into SQL — the canonical injection signal.",
	"injection.nosql.gt_empty":            "We replaced a string field in your JSON body with the operator object `{\"$gt\":\"\"}`. If the response status flips from 4xx to 200 (logged in without a real password), you've got Mongo-style operator injection.",
	"injection.cmd.semicolon":             "We measured a baseline response time, then sent `;sleep 4;#` injected into a parameter. If the response takes ~4 seconds longer, the shell ran our `sleep` — meaning user input is being concatenated into a system command.",
	"injection.ssti.curly_seven":          "We sent `{{7*7}}` as a parameter value. If the response body contains `49` instead of the literal `{{7*7}}`, your template engine evaluated the input — server-side template injection that often escalates to RCE.",

	// Injection — extras
	"injection.sqli.boolean_blind":        "We sent three versions of the same request — a control, an always-true tautology (`' OR '1'='1`), and an always-false one (`' AND '1'='2`). Comparing response sizes: TRUE matches control, FALSE doesn't = boolean-based blind SQL injection.",
	"injection.sqli.time_blind":           "We measured baseline timing, then injected `'; SELECT pg_sleep(4)--` (and a MySQL `SLEEP(4)` fallback). If the database honours the delay (~4s extra wall time), it's executing our payload as SQL.",
	"injection.path_traversal":            "We probed common file-path parameters (file, path, name, doc, …) with classic Linux + Windows traversal payloads (`../../../../etc/passwd`, URL-encoded variants, double-encoded). A response containing `root:x:0:0` proves the server reads attacker-controlled filenames.",
	"injection.ssrf.metadata":             "We sent the AWS instance metadata IP (`http://169.254.169.254/latest/meta-data/`) as a value for URL-shaped parameters (url, redirect, webhook, image_url, callback…). If the response contains metadata-shape content (`ami-id`, `iam/`), the server is fetching attacker-controlled URLs.",
	"injection.open_redirect":             "We sent `https://kavach-attacker.example.com/` as a value for redirect-shape parameters (redirect, return_to, next, url, destination…). If the server responds with `Location: kavach-attacker.example.com`, your redirect can be used for phishing.",
	"injection.hpp":                       "We duplicated the first query parameter with a different value and compared response status to a single-value baseline. A status flip means different layers parse duplicates differently — WAF / framework / app drift used to bypass filters.",

	// Method tampering
	"method.options_reveal":               "We sent an `OPTIONS` request to the endpoint. A response with an `Allow` (or `Access-Control-Allow-Methods`) header listing every supported verb is informational reconnaissance — tells attackers which verbs to try.",
	"method.trace_enabled":                "We sent a `TRACE` request. A 200 response that echoes the request line in the body proves TRACE is on — useful only for debug, dangerous because of XST (cross-site tracing) attacks that can pull cookies.",
	"method.alternate_verb_200":           "We tried alternate verbs (GET / POST / PUT / DELETE / PATCH) against the same URL. A 2xx for a verb other than the original = unintended handler, often broken function-level authorization.",
	"method.override_header_bypass":       "We sent a POST with `X-HTTP-Method-Override: DELETE`. If the response differs from a plain POST baseline, the framework is honouring the header — letting attackers smuggle a DELETE past WAFs that lock down DELETE.",
}

// ExplainTest returns the explanation for a test_id, or empty string when
// not registered. Falls back to the longest registered prefix — handy for
// tests that emit per-variant ids like `method.alternate_verb_200.post`.
func ExplainTest(testID string) string {
	if v, ok := TestExplanations[testID]; ok {
		return v
	}
	// Walk back to the parent test ID (e.g. `.post` suffix) so multi-variant
	// tests share the same explanation.
	for i := len(testID) - 1; i > 0; i-- {
		if testID[i] == '.' {
			if v, ok := TestExplanations[testID[:i]]; ok {
				return v
			}
		}
	}
	return ""
}
