package report

import "fmt"

type Severity string

const (
	SevGood    Severity = "good"
	SevInfo    Severity = "info"
	SevWarn    Severity = "warn"
	SevBad     Severity = "bad"
	SevCritical Severity = "critical"
)

type Insight struct {
	Severity    Severity
	Title       string
	Detail      string
	Recommend   string
}

// Verdict is shown as the big banner at the top.
type Verdict struct {
	Severity Severity
	Headline string
	Summary  string
}

// Standard SLO targets used to grade a run.
const (
	TargetErrorRatePct = 1.0    // Google SRE error budget
	TargetP95Ms        = 500.0  // industry standard SLO
	TargetP99Ms        = 1000.0 // Google SRE handbook
	TargetVarianceX    = 3.0    // p95 within 3× p50 (we warn beyond)
)

func GradeVerdict(a Aggregates) Verdict {
	violations := []string{}
	if a.ErrorPct > TargetErrorRatePct {
		violations = append(violations, fmt.Sprintf("error rate of %.2f%% exceeds the %.0f%% target", a.ErrorPct, TargetErrorRatePct))
	}
	if a.P95Ms > TargetP95Ms {
		violations = append(violations, fmt.Sprintf("p95 latency of %.0fms exceeds the %.0fms target", a.P95Ms, TargetP95Ms))
	}
	if a.P99Ms > TargetP99Ms {
		violations = append(violations, fmt.Sprintf("p99 latency of %.0fms exceeds the %.0fms target", a.P99Ms, TargetP99Ms))
	}

	if len(violations) == 0 {
		return Verdict{
			Severity: SevGood,
			Headline: "Test Passed — API meets all targets",
			Summary:  "Your API stayed within error and latency budgets for the duration of this load test. Safe to ship at this load level.",
		}
	}

	sev := SevWarn
	if a.ErrorPct >= 5 || a.P99Ms >= 2000 {
		sev = SevBad
	}
	if a.ErrorPct >= 25 || a.SuccessPct == 0 {
		sev = SevCritical
	}

	headline := "Test Warning — API is Degraded"
	if sev == SevBad {
		headline = "Test Failed — API has serious issues"
	} else if sev == SevCritical {
		headline = "Test Failed — API is broken under this load"
	}
	summary := "The API did not meet all performance targets. Problems detected: " + join(violations) + ". See insights and recommendations below for fixes."
	return Verdict{Severity: sev, Headline: headline, Summary: summary}
}

func DeriveInsights(a Aggregates) []Insight {
	out := []Insight{}

	if a.Requests == 0 {
		out = append(out, Insight{
			Severity: SevCritical,
			Title:    "No requests completed",
			Detail:   "The engine never received a successful response. The target may be unreachable, the URL malformed, or auth missing.",
			Recommend: "Curl the target manually with the same headers and body. Confirm the URL has a scheme (http:// or https://) and the host resolves.",
		})
		return out
	}

	if a.ErrorPct > 0 {
		sev := SevWarn
		if a.ErrorPct >= 5 {
			sev = SevBad
		}
		out = append(out, Insight{
			Severity: sev,
			Title:    fmt.Sprintf("%.2f%% of requests failed (%d / %d)", a.ErrorPct, a.Errors, a.Requests),
			Detail:   "Failures may be timeouts, network errors, or HTTP error responses. Check the 'Error details' table below for the exact cause.",
			Recommend: "If most failures are timeouts, the API is too slow under this load — profile the slowest endpoint or scale horizontally. If they're 5xx, look for unhandled exceptions or DB connection exhaustion.",
		})
	}

	// Specific error-class insights from status codes.
	var s5 int64
	var s4 int64
	var sNet int64
	for code, n := range a.StatusCounts {
		switch {
		case code == 0:
			sNet += n
		case code >= 500:
			s5 += n
		case code >= 400:
			s4 += n
		}
	}
	if s5 > 0 {
		out = append(out, Insight{
			Severity: SevBad,
			Title:    fmt.Sprintf("%d server-side failures (5xx)", s5),
			Detail:   "5xx means the server crashed, timed out internally, or rejected the request due to its own state.",
			Recommend: "Check application logs at the times listed in the latency-over-time chart. Common causes: database pool exhaustion, OOM, slow downstream service, deploy in progress.",
		})
	}
	if s4 > 0 {
		out = append(out, Insight{
			Severity: SevWarn,
			Title:    fmt.Sprintf("%d client errors (4xx)", s4),
			Detail:   "4xx usually means the test request itself is wrong: bad auth header, malformed body, missing required field, or rate limiting (429).",
			Recommend: "Run the request once manually with curl. If it still 4xxs, the test config is wrong. If it succeeds in isolation but fails under load, you're likely being rate-limited.",
		})
	}
	if sNet > 0 {
		out = append(out, Insight{
			Severity: SevBad,
			Title:    fmt.Sprintf("%d network/transport failures", sNet),
			Detail:   "These never reached the server (DNS failure, connection refused, TLS error, or timeout).",
			Recommend: "Check DNS resolution, firewall rules, and TLS configuration on the target. The 'Why requests failed' panel below names the exact cause for each failure.",
		})
	}

	// Latency insights.
	if a.P95Ms > TargetP95Ms {
		out = append(out, Insight{
			Severity: SevWarn,
			Title:    fmt.Sprintf("p95 latency is %.0fms (target < %.0fms)", a.P95Ms, TargetP95Ms),
			Detail:   "1 in 20 users waited longer than this. At p95 above 500ms users perceive the API as 'slow'.",
			Recommend: "Profile the slowest endpoint. Look for N+1 queries, missing indexes, unbounded loops, or synchronous calls to slow downstream services.",
		})
	}
	if a.P99Ms > TargetP99Ms {
		out = append(out, Insight{
			Severity: SevBad,
			Title:    fmt.Sprintf("p99 latency is %.0fms (Google SRE target < %.0fms)", a.P99Ms, TargetP99Ms),
			Detail:   "1 in 100 requests took this long. Tail latency this high means a small but real population of users experiences the API as broken.",
			Recommend: "Tail latency is usually GC pauses, lock contention, queueing, or cold caches. Add structured tracing to find which segment of the request takes the time.",
		})
	}
	if a.P50Ms > 0 && a.P95Ms/a.P50Ms > TargetVarianceX {
		out = append(out, Insight{
			Severity: SevWarn,
			Title:    fmt.Sprintf("Highly variable latency (p95 is %.1f× p50)", a.P95Ms/a.P50Ms),
			Detail:   "Predictable APIs have p95 within ~2× of p50. Wide spread means some requests are very slow even when others are fast.",
			Recommend: "Look for shared resources under contention: a single thread pool, a single DB connection, a global lock. Add a queue-depth metric to find the bottleneck.",
		})
	}

	if a.PeakRPS > 0 && a.AvgRPS/a.PeakRPS < 0.5 && a.AvgRPS > 0 {
		out = append(out, Insight{
			Severity: SevInfo,
			Title:    fmt.Sprintf("Throughput was uneven — average %.1f rps vs peak %.0f rps", a.AvgRPS, a.PeakRPS),
			Detail:   "The API handled bursts up to peak but didn't sustain that rate. This is normal during ramp-up; if it happens at steady-state, you have backpressure.",
		})
	}

	// Detect timeout-shaped errors from the error reasons map.
	if a.ErrorReasons != nil {
		for reason, n := range a.ErrorReasons {
			if n > 0 && (containsAny(reason, "timed out", "timeout")) {
				out = append(out, Insight{
					Severity: SevBad,
					Title:    fmt.Sprintf("%d timeouts occurred", n),
					Detail:   "Either the API is too slow under this load, or your timeout is set too aggressively for normal traffic.",
					Recommend: "First, raise the request timeout and re-run to confirm whether requests *eventually* succeed. If they do, the API is slow — fix the bottleneck. If they still fail, the API has a real hang.",
				})
				break
			}
		}
	}

	if len(out) == 0 {
		out = append(out, Insight{
			Severity: SevGood,
			Title:    "No anomalies detected",
			Detail:   "Latency stayed within targets, throughput was steady, and error rate was zero.",
		})
	}
	return out
}

func join(parts []string) string {
	switch len(parts) {
	case 0:
		return ""
	case 1:
		return parts[0]
	}
	out := parts[0]
	for i := 1; i < len(parts); i++ {
		out += "; " + parts[i]
	}
	return out
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if indexFold(s, sub) >= 0 {
			return true
		}
	}
	return false
}

func indexFold(s, sub string) int {
	if len(sub) == 0 {
		return 0
	}
	if len(sub) > len(s) {
		return -1
	}
	lower := func(b byte) byte {
		if b >= 'A' && b <= 'Z' {
			return b + 32
		}
		return b
	}
	for i := 0; i+len(sub) <= len(s); i++ {
		match := true
		for j := 0; j < len(sub); j++ {
			if lower(s[i+j]) != lower(sub[j]) {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}
