package kavach

import (
	"context"
	"net/http"
	"strings"
	"time"
)

// Injection tests fire well-known payload shapes at every query parameter
// (and add a synthetic `kavach_probe` parameter for endpoints with no
// existing query string). They look for telltale response markers:
//   - SQL: error fragments ("SQLSTATE", "syntax error near", "ORA-"…).
//   - SSTI: payload `{{7*7}}` echoed back as `49`.
//   - Command: time-based — `;sleep 5;` adds wall-clock latency.
//   - NoSQL: `{"$ne": null}` in a JSON body changes status from 401 → 200.

// ─── SQL injection — quote-break probe ─────────────────────────────────
type sqliQuoteBreak struct{}

func (sqliQuoteBreak) ID() string         { return "injection.sqli.quote_break" }
func (sqliQuoteBreak) Name() string       { return "SQL injection — single-quote error" }
func (sqliQuoteBreak) Category() Category { return CatInjection }

var sqlMarkers = []string{
	"sqlstate",
	"syntax error",
	"unclosed quotation",
	"ora-0",
	"mysql_fetch",
	"pg_query",
	"sqlite3.operationalerror",
	"you have an error in your sql syntax",
	"warning: pg_",
	"postgresql.exceptions",
	"odbc microsoft access driver",
	"sqlserver",
}

func (s sqliQuoteBreak) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	probe := t.BaseRequest
	probe.URL = mutateQueryParam(t.BaseRequest.URL, "id", "1'\"")
	target := t
	target.BaseRequest = probe

	resp, body, err := sendBase(ctx, target, hc, "")
	if err != nil {
		return nil
	}
	low := strings.ToLower(string(body))
	for _, m := range sqlMarkers {
		if strings.Contains(low, m) {
			return []Finding{{
				TestID:   s.ID(),
				Category: s.Category(),
				Severity: SevCritical,
				Title:    "SQL error leaked under quote-break payload",
				Description: "Sending `id=1'\"` produced a response containing a SQL-error marker (\"" + m + "\"). The query parameter is being interpolated into a SQL statement without parameterised binding — the same payload an attacker uses to fingerprint SQL injection.",
				OWASP:       "API8:2023",
				CWE:         "CWE-89",
				Remediation: "Parameterise every database call. Never concatenate user input into SQL strings — use placeholders (`?` / `$1` / named bindings) and let the driver bind values.",

				PlainTitle:          "SQL injection: your database is accepting raw user input",
				PlainWhatsHappening: "We sent `id=1'\"` to your endpoint. Instead of treating it as a string, your code passed it straight into a SQL query. The query broke and your server leaked the SQL error back to us — proof the input is being used as code, not data.",
				PlainWhy:            "This is the canonical SQL injection bug. Once we know it's there, dumping your entire database is a few payloads away. CRITICAL — fix immediately.",
				PlainHowToFix: []string{
					"Find the code path that handles this parameter and replace any `\"WHERE id=\" + userInput` with parameterised binding.",
					"Node + Postgres: `pool.query(\"SELECT … WHERE id=$1\", [id])`. Python + SQLAlchemy: pass values, never .format(). PHP: `$stmt->bindValue(...)`.",
					"After the fix, re-run this scan to confirm the SQL marker is gone.",
				},
				Effort: Effort30Min,

				Request:      probe,
				Response:     snapshotResponse(resp, body),
				EvidenceText: "Marker: " + m + "\n\n" + excerptAround(string(body), m, 240),
			}}
		}
	}
	return nil
}

// ─── NoSQL injection — operator injection ──────────────────────────────
type nosqliGtEmpty struct{}

func (nosqliGtEmpty) ID() string         { return "injection.nosql.gt_empty" }
func (nosqliGtEmpty) Name() string       { return "NoSQL injection — operator probe" }
func (nosqliGtEmpty) Category() Category { return CatInjection }

func (n nosqliGtEmpty) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	// Only meaningful when the user supplied a JSON body — we need an auth-
	// shaped endpoint to learn anything. Skip otherwise.
	body := strings.TrimSpace(t.BaseRequest.Body)
	if body == "" || !strings.HasPrefix(body, "{") {
		return nil
	}
	// Run a "control" request first to capture the baseline response.
	baseResp, baseBody, err := sendBase(ctx, t, hc, "")
	if err != nil {
		return nil
	}
	baseStatus := baseResp.StatusCode

	// Mutate: replace any string field value with `{"$gt":""}` once.
	mutated := injectNoSQLOp(t.BaseRequest.Body)
	if mutated == t.BaseRequest.Body {
		return nil
	}
	probe := t.BaseRequest
	probe.Body = mutated
	target := t
	target.BaseRequest = probe

	probeResp, probeBody, err := sendBase(ctx, target, hc, "")
	if err != nil {
		return nil
	}

	// "Got more data" heuristic: control was 4xx/5xx, probe is 200 — strong
	// signal that the operator bypassed something.
	if (baseStatus >= 400 && baseStatus < 600) && probeResp.StatusCode == 200 && len(probeBody) > 0 {
		return []Finding{{
			TestID:   n.ID(),
			Category: n.Category(),
			Severity: SevCritical,
			Title:    "NoSQL operator bypassed authentication or filter",
			Description: "Replacing a JSON string value with `{\"$gt\":\"\"}` flipped the response from " + baseResp.Status + " to 200. The endpoint is passing user-supplied JSON straight into a Mongo (or similar) query without sanitising operators.",
			OWASP:       "API8:2023",
			CWE:         "CWE-943",
			Remediation: "Coerce user-supplied values to scalars before querying. In Mongoose: use `.find({ field: String(input) })` not `.find({ field: input })`. Reject any object value where a string is expected.",

			PlainTitle:          "Login bypass via NoSQL operator injection",
			PlainWhatsHappening: "We sent your endpoint a body where one of the fields was an object containing the operator `$gt: \"\"`. Your database treated that as \"match anything\" and returned a 200 — without us providing a real password.",
			PlainWhy:            "This is how NoSQL apps get their auth bypassed. Anyone reading this scan can take over any account on the system in minutes.",
			PlainHowToFix: []string{
				"Coerce every user-supplied value to a primitive (string / number) before passing it to the database driver.",
				"Reject non-scalar inputs at your validation layer (Joi / Zod / Pydantic / class-validator).",
				"Audit every login / lookup endpoint that accepts JSON for the same pattern.",
			},
			Effort: Effort30Min,

			Request:      probe,
			Response:     snapshotResponse(probeResp, probeBody),
			EvidenceText: "Control: " + baseResp.Status + " (len " + intToStr(len(baseBody)) + ") → Probe: " + probeResp.Status + " (len " + intToStr(len(probeBody)) + ")",
		}}
	}
	return nil
}

// injectNoSQLOp finds the FIRST `"key": "value"` pair in a JSON body and
// replaces the value with the operator object. Returns the original body
// if nothing matched.
func injectNoSQLOp(body string) string {
	// Cheap regex-free walk: find `":"` then jump to the value's first `"`
	// and replace until the matching close quote. Keeps the rest intact.
	idx := strings.Index(body, "\":\"")
	if idx < 0 {
		idx = strings.Index(body, "\": \"")
	}
	if idx < 0 {
		return body
	}
	open := strings.Index(body[idx:], "\"") // first `"`
	if open < 0 {
		return body
	}
	open += idx
	// Skip past the colon's `"` — find the start of the VALUE quote.
	valOpen := strings.Index(body[open+1:], "\"")
	if valOpen < 0 {
		return body
	}
	valOpen += open + 1
	valEnd := strings.Index(body[valOpen+1:], "\"")
	if valEnd < 0 {
		return body
	}
	valEnd += valOpen + 1
	return body[:valOpen] + `{"$gt":""}` + body[valEnd+1:]
}

// ─── Command injection — semicolon time-based ──────────────────────────
type cmdInjectionSemicolon struct{}

func (cmdInjectionSemicolon) ID() string         { return "injection.cmd.semicolon" }
func (cmdInjectionSemicolon) Name() string       { return "Command injection — sleep timing probe" }
func (cmdInjectionSemicolon) Category() Category { return CatInjection }

func (c cmdInjectionSemicolon) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	// Baseline response time.
	t0 := time.Now()
	if _, _, err := sendBase(ctx, t, hc, ""); err != nil {
		return nil
	}
	baseline := time.Since(t0)
	if baseline > 4*time.Second {
		// Slow endpoint — timing test would be unreliable; skip.
		return nil
	}
	// Probe with `;sleep 4;` injected into a query parameter. We watch for
	// at least 3 seconds of additional wall-clock delay vs baseline.
	probe := t.BaseRequest
	probe.URL = mutateQueryParam(t.BaseRequest.URL, "name", "test;sleep 4;#")
	target := t
	target.BaseRequest = probe
	t1 := time.Now()
	resp, body, err := sendBase(ctx, target, hc, "")
	if err != nil {
		return nil
	}
	delta := time.Since(t1) - baseline
	if delta < 3*time.Second {
		return nil
	}
	return []Finding{{
		TestID:   c.ID(),
		Category: c.Category(),
		Severity: SevCritical,
		Title:    "Probable command injection — payload caused server delay",
		Description: "Adding `;sleep 4;` to a query parameter caused a ~" + delta.Truncate(100*time.Millisecond).String() + " response delay vs the baseline. This is the classic time-based detection for command injection — the shell ran our `sleep` because user input was concatenated into a system command.",
		OWASP:       "API8:2023",
		CWE:         "CWE-78",
		Remediation: "Never concatenate user input into shell commands. Use the language's argv-based exec (Node `child_process.execFile`, Python `subprocess.run([...])`). If you must shell out, whitelist the input strictly.",

		PlainTitle:          "Command injection: your server is running input from the URL as shell commands",
		PlainWhatsHappening: "We added `;sleep 4;` to a query parameter. The response took 4 extra seconds — that's our `sleep` actually running on your server. Whatever the parameter is being passed to is treating it as a shell command.",
		PlainWhy:            "This is the worst-case web bug. An attacker can run any command — read your filesystem, dump secrets, install a backdoor. CRITICAL — fix today.",
		PlainHowToFix: []string{
			"Find the call site that uses this parameter. If it shells out (`exec`, `child_process.exec`, `os.system`), STOP shelling out — use the argv form: `execFile(\"convert\", [filename])`.",
			"If the use case genuinely needs a shell, whitelist the input against a strict regex BEFORE passing it.",
			"After the fix, re-run this test to confirm the delay is gone.",
		},
		Effort: Effort30Min,

		Request:      probe,
		Response:     snapshotResponse(resp, body),
		EvidenceText: "Baseline: " + baseline.String() + " · Probe: " + (delta + baseline).String() + " (Δ " + delta.String() + ")",
	}}
}

// ─── SSTI — `{{7*7}}` echoed as 49 ──────────────────────────────────────
type sstiCurlySeven struct{}

func (sstiCurlySeven) ID() string         { return "injection.ssti.curly_seven" }
func (sstiCurlySeven) Name() string       { return "Server-side template injection — {{7*7}} probe" }
func (sstiCurlySeven) Category() Category { return CatInjection }

func (s sstiCurlySeven) Run(ctx context.Context, t Target, hc *http.Client) []Finding {
	probe := t.BaseRequest
	probe.URL = mutateQueryParam(t.BaseRequest.URL, "name", "{{7*7}}")
	target := t
	target.BaseRequest = probe

	resp, body, err := sendBase(ctx, target, hc, "")
	if err != nil {
		return nil
	}
	// Marker: the response body contains "49" but NOT the literal "{{7*7}}".
	bs := string(body)
	if strings.Contains(bs, "49") && !strings.Contains(bs, "{{7*7}}") {
		return []Finding{{
			TestID:   s.ID(),
			Category: s.Category(),
			Severity: SevHigh,
			Title:    "Server-side template injection — `{{7*7}}` evaluated",
			Description: "The payload `{{7*7}}` was rendered as `49` in the response body. A user-supplied string is being passed through a server-side template engine (Jinja, Twig, ERB, Handlebars-server, Velocity, …) which then evaluates the expression. Depending on the engine, this can escalate to remote code execution.",
			OWASP:       "API8:2023",
			CWE:         "CWE-1336",
			Remediation: "Never pass user input to a template's `render` method. Treat templates as code — they should only ever receive data via a context dictionary, not be assembled from strings.",

			PlainTitle:          "Your template engine is rendering input from the URL",
			PlainWhatsHappening: "We sent `{{7*7}}` in a query parameter. Your response came back containing `49` instead of `{{7*7}}` — meaning your server-side template engine evaluated our input as code.",
			PlainWhy:            "Most template engines have escape hatches that let a `{{…}}` expression read environment variables, list directories, or run shell commands. SSTI very often becomes RCE.",
			PlainHowToFix: []string{
				"Find the code that calls `template.render(...)` (or equivalent) with user-supplied input. Stop concatenating user input into template strings.",
				"Pass user input as values via the context object: `template.render(\"{{name}}\", {name: userInput})` — never `template.render(\"hello \" + userInput)`.",
				"If you genuinely need to let users provide template syntax, sandbox the engine or whitelist a small DSL.",
			},
			Effort: EffortSprint,

			Request:      probe,
			Response:     snapshotResponse(resp, body),
			EvidenceText: "Payload `{{7*7}}` rendered as `49` in response body.",
		}}
	}
	return nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────
func intToStr(i int) string {
	// Avoid pulling strconv in for one call — keeps the test files self-contained.
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	digits := []byte{}
	for i > 0 {
		digits = append([]byte{byte('0' + i%10)}, digits...)
		i /= 10
	}
	if neg {
		digits = append([]byte{'-'}, digits...)
	}
	return string(digits)
}

// ─── Catalogue ──────────────────────────────────────────────────────────
func InjectionTests() []Test {
	return []Test{
		sqliQuoteBreak{}, nosqliGtEmpty{}, cmdInjectionSemicolon{}, sstiCurlySeven{},
	}
}
