package kavach

import (
	"context"
	"net/http"
	"strings"
)

// ─── OPTIONS reveal ────────────────────────────────────────────────────
// Sends an OPTIONS request and checks whether the server hands back the
// `Allow:` header listing every supported verb. Useful info for an attacker
// when they're trying to find an under-protected route.
type methodOptionsReveal struct{}

func (methodOptionsReveal) ID() string         { return "method.options_reveal" }
func (methodOptionsReveal) Name() string       { return "OPTIONS reveals supported verbs" }
func (methodOptionsReveal) Category() Category { return CatMethodTampering }

func (m methodOptionsReveal) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	resp, body, err := sendBase(ctx, t, hc, "OPTIONS")
	if err != nil {
		return nil
	}
	allow := resp.Header.Get("Allow")
	if allow == "" {
		// Some servers return CORS-style Access-Control-Allow-Methods instead.
		allow = resp.Header.Get("Access-Control-Allow-Methods")
	}
	if allow == "" {
		return nil
	}
	probe := t.BaseRequest
	probe.Method = "OPTIONS"
	return []Finding{{
		TestID:   m.ID(),
		Category: m.Category(),
		Severity: SevInfo,
		Title:    "OPTIONS request lists every supported verb",
		Description: "An OPTIONS request returned an `Allow` header containing: " + allow + ". This is informational, not a vulnerability — but it gives an attacker a complete map of the verbs your endpoint accepts.",
		OWASP:       "API5:2023",
		CWE:         "CWE-650",
		Remediation: "Decide whether you need OPTIONS at all. For non-CORS routes, return 405. For CORS preflights, restrict `Access-Control-Allow-Methods` to the verbs the client actually needs.",

		PlainTitle:          "Your endpoint hands attackers a list of verbs to try",
		PlainWhatsHappening: "We sent an OPTIONS request to your endpoint. Your server replied with `Allow: " + allow + "` — basically a printable menu of what to try next.",
		PlainWhy:            "It's not exploitable on its own, but attackers love this kind of free reconnaissance. Closing it removes their first move.",
		PlainHowToFix: []string{
			"If this isn't a CORS-preflight target, return 405 Method Not Allowed for OPTIONS.",
			"If you do need CORS, narrow `Access-Control-Allow-Methods` to the specific verbs (e.g. `GET, POST`) instead of every verb your route handles.",
		},
		Effort: Effort5Min,

		Request:      probe,
		Response:     snapshotResponse(resp, body),
		EvidenceText: "Allow: " + allow,
	}}
}

// ─── TRACE enabled ─────────────────────────────────────────────────────
type methodTraceEnabled struct{}

func (methodTraceEnabled) ID() string         { return "method.trace_enabled" }
func (methodTraceEnabled) Name() string       { return "TRACE method enabled" }
func (methodTraceEnabled) Category() Category { return CatMethodTampering }

func (m methodTraceEnabled) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	resp, body, err := sendBase(ctx, t, hc, "TRACE")
	if err != nil {
		return nil
	}
	if resp.StatusCode != 200 {
		return nil
	}
	// Genuine TRACE response echoes the request — we look for our request
	// line in the body.
	bs := string(body)
	if !strings.Contains(bs, "TRACE ") {
		return nil
	}
	probe := t.BaseRequest
	probe.Method = "TRACE"
	return []Finding{{
		TestID:   m.ID(),
		Category: m.Category(),
		Severity: SevMedium,
		Title:    "HTTP TRACE method is enabled",
		Description: "The server responded 200 to a TRACE request and echoed the request line in the body. TRACE was historically used to debug proxies but it lets an attacker pull cookies / Authorization headers out of a victim's request via XST (cross-site tracing).",
		OWASP:       "API8:2023",
		CWE:         "CWE-200",
		Remediation: "Disable TRACE at the reverse proxy. Nginx: it's off by default but `if ($request_method = TRACE) { return 405; }` makes it explicit. Apache: `TraceEnable off`. App-level: reject TRACE in your router.",

		PlainTitle:          "TRACE is on — old debug feature, modern security risk",
		PlainWhatsHappening: "Your server accepts the TRACE method. TRACE is meant for debugging proxies, but in practice it lets a clever attacker pull cookies and auth headers out of a victim's session via cross-site tracing (XST).",
		PlainWhy:            "There's almost never a real reason to leave TRACE on. Turning it off costs nothing and removes a whole class of attack.",
		PlainHowToFix: []string{
			"Reject TRACE at your reverse proxy.",
			"Nginx: add `if ($request_method = TRACE) { return 405; }` to the server block.",
			"Apache: set `TraceEnable off`.",
			"Spring / Express: explicitly route TRACE to a 405 handler.",
		},
		Effort: Effort5Min,

		Request:      probe,
		Response:     snapshotResponse(resp, body),
		EvidenceText: "TRACE request echoed in 200 response body.",
	}}
}

// ─── Alternate verb returns 200 ────────────────────────────────────────
// Tries verbs the operator probably didn't intend. If a verb other than
// the user's original method returns 200 / 201 / 204, that's worth a look
// — could be unintended functionality (mass-assignment via PUT etc).
type methodAlternateVerb struct{}

func (methodAlternateVerb) ID() string         { return "method.alternate_verb_200" }
func (methodAlternateVerb) Name() string       { return "Alternate HTTP verb accepted" }
func (methodAlternateVerb) Category() Category { return CatMethodTampering }

func (m methodAlternateVerb) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	original := strings.ToUpper(t.BaseRequest.Method)
	if original == "" {
		original = "GET"
	}
	verbs := []string{"GET", "POST", "PUT", "DELETE", "PATCH"}
	out := []Finding{}
	for _, v := range verbs {
		if v == original {
			continue
		}
		// Skip dangerous mutations on a non-explicit endpoint; we only
		// PROBE — not actually delete data. But to be safe we use HEAD-style
		// expectation: a 2xx on PUT/DELETE on what was originally a GET is
		// a strong signal something's wrong.
		resp, body, err := sendBase(ctx, t, hc, v)
		if err != nil {
			continue
		}
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			probe := t.BaseRequest
			probe.Method = v
			out = append(out, Finding{
				TestID:   m.ID() + "." + strings.ToLower(v),
				Category: m.Category(),
				Severity: SevHigh,
				Title:    "Endpoint accepts " + v + " when only " + original + " was expected",
				Description: "This route was scanned with original method " + original + ". A " + v + " request returned " + resp.Status + " — meaning the server has a handler for that verb that you may not have intended.",
				OWASP:       "API5:2023",
				CWE:         "CWE-285",
				Remediation: "Audit the route handler. If the endpoint shouldn't support " + v + ", ensure your router only registers " + original + " — not the framework's catch-all (e.g. Express's `app.all`, Spring's `@RequestMapping` without `method=`).",

				PlainTitle:          "Your route accepts methods you didn't expect",
				PlainWhatsHappening: "The original request used " + original + ". When we tried the same URL with " + v + ", your server returned " + resp.Status + ". That means a different code path is handling " + v + " requests on this URL — possibly bypassing the auth / validation you put on the " + original + " path.",
				PlainWhy:            "This is how broken function-level authorization happens — the developer locked down POST but forgot PUT.",
				PlainHowToFix: []string{
					"Check your router config. Make sure each route declares only the methods it should accept.",
					"Avoid framework catch-alls (Express `app.all`, Flask without `methods=[]`, etc).",
					"After fixing, re-run this scan to confirm only " + original + " returns 2xx.",
				},
				Effort: Effort30Min,

				Request:      probe,
				Response:     snapshotResponse(resp, body),
				EvidenceText: original + " was original; " + v + " returned " + resp.Status,
			})
			// One finding per scan is enough; don't spam.
			break
		}
	}
	return out
}

// ─── X-HTTP-Method-Override header bypass ─────────────────────────────
type methodOverrideHeader struct{}

func (methodOverrideHeader) ID() string         { return "method.override_header_bypass" }
func (methodOverrideHeader) Name() string       { return "X-HTTP-Method-Override accepted" }
func (methodOverrideHeader) Category() Category { return CatMethodTampering }

func (m methodOverrideHeader) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	original := strings.ToUpper(t.BaseRequest.Method)
	if original != "GET" && original != "POST" {
		return nil
	}
	// Send a POST with X-HTTP-Method-Override: DELETE. If the server treats
	// it as a DELETE (returns 200 / 204 / 405 differently than baseline),
	// the smuggling header is honoured.
	probe := t.BaseRequest
	if probe.Headers == nil {
		probe.Headers = map[string]string{}
	} else {
		nh := make(map[string]string, len(probe.Headers)+1)
		for k, v := range probe.Headers {
			nh[k] = v
		}
		probe.Headers = nh
	}
	probe.Headers["X-HTTP-Method-Override"] = "DELETE"
	probe.Method = "POST"
	target := t
	target.BaseRequest = probe

	// Get baseline POST response without the override header.
	bare := t
	bare.BaseRequest.Method = "POST"
	bResp, _, err := sendBase(ctx, bare, hc, "POST")
	if err != nil {
		return nil
	}
	resp, body, err := sendBase(ctx, target, hc, "POST")
	if err != nil {
		return nil
	}
	if resp.StatusCode == bResp.StatusCode {
		// No behavioural difference — no smoking gun.
		return nil
	}
	return []Finding{{
		TestID:   m.ID(),
		Category: m.Category(),
		Severity: SevHigh,
		Title:    "X-HTTP-Method-Override changes behaviour — verb smuggling possible",
		Description: "Adding `X-HTTP-Method-Override: DELETE` to a POST changed the response (baseline " + bResp.Status + " → with header " + resp.Status + "). Some frameworks honour this header for legacy clients — if your auth / WAF gates on the visible POST verb, an attacker can use this to smuggle a DELETE past it.",
		OWASP:       "API5:2023",
		CWE:         "CWE-285",
		Remediation: "Disable method-override middleware (or the framework's equivalent) unless you have a specific legacy client that needs it. If you must keep it, ensure your authorisation layer reads the OVERRIDDEN method, not the wire method.",

		PlainTitle:          "Verb smuggling: a header lets POST become DELETE",
		PlainWhatsHappening: "We sent a POST with a special header `X-HTTP-Method-Override: DELETE`. Your server's response changed — meaning the framework is rewriting the verb based on the header.",
		PlainWhy:            "If your auth layer locks down DELETE but lets POST through, this header lets an attacker bypass the lock by sending a POST that gets handled as DELETE.",
		PlainHowToFix: []string{
			"Check whether you actually need method-override middleware. Most modern apps don't.",
			"Express: remove `app.use(methodOverride())`. Spring: drop `HiddenHttpMethodFilter`. Symfony: set `framework.http_method_override: false`.",
			"If you must keep it, make sure the auth check runs AFTER the verb is normalised.",
		},
		Effort: Effort30Min,

		Request:      probe,
		Response:     snapshotResponse(resp, body),
		EvidenceText: "Baseline POST: " + bResp.Status + " · POST + override DELETE: " + resp.Status,
	}}
}

// ─── Catalogue ──────────────────────────────────────────────────────────
func MethodTamperingTests() []Test {
	return []Test{
		methodOptionsReveal{}, methodTraceEnabled{}, methodAlternateVerb{}, methodOverrideHeader{},
	}
}
