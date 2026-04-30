// Package kavach implements the API VAPT (Vulnerability Assessment +
// Penetration Testing) tool — branded "Kavach" (Sanskrit for "shield /
// armour"). It accepts a parsed HTTP request as a Target, fans out a
// battery of Test implementations against it, and produces a stream of
// Findings with severity + remediation guidance.
//
// The package is structured so each test is small + isolated. A Test is
// just `Run(ctx, target, http) []Finding` — no shared state between tests
// beyond the rate limiter, which lives in the runner.
package kavach

import (
	"context"
	"net/http"
	"time"

	"github.com/choicetechlab/choicehammer/internal/tools/apistress/engine"
)

// Severity ranks findings by impact. The UI maps these to friendly labels
// ("Fix this now" / "Fix this week" / …) but the wire and DB stay
// machine-readable so downstream tools can sort + filter cleanly.
type Severity string

const (
	SevCritical Severity = "critical"
	SevHigh     Severity = "high"
	SevMedium   Severity = "medium"
	SevLow      Severity = "low"
	SevInfo     Severity = "info"
)

// Effort is a rough how-long-to-fix hint shown alongside each finding.
// Heuristic — set by each test based on the typical fix shape.
type Effort string

const (
	Effort5Min  Effort = "5-min"  // header tweak, single-line change
	Effort30Min Effort = "30-min" // small refactor, validate one input
	EffortSprint Effort = "sprint" // architectural — input validation layer, auth model
)

// Category groups related tests for the UI's per-category progress bars
// and report grouping.
type Category string

const (
	CatTransport       Category = "transport"
	CatInfoDisclosure  Category = "info_disclosure"
	CatInjection       Category = "injection"
	CatMethodTampering Category = "method_tampering"
)

// Target is what every Test sees. BaseRequest is the user-supplied request
// (parsed from curl); tests may mutate copies of it.
type Target struct {
	BaseRequest engine.HTTPRequest
	Host        string
	Origin      string // scheme://host[:port] derived from BaseRequest.URL — convenient for path-traversal tests
}

// ResponseSnapshot is the trimmed evidence we keep for a finding. Body is
// truncated upstream by safety.go before persistence.
type ResponseSnapshot struct {
	Status     int               `json:"status"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	BodyTrunc  bool              `json:"body_truncated,omitempty"`
	DurationMs int64             `json:"duration_ms"`
}

// Finding is what each Test produces.
type Finding struct {
	ID          int64    `json:"id"`
	TestID      string   `json:"test_id"`
	Category    Category `json:"category"`
	Severity    Severity `json:"severity"`

	// Technical framing — primary description, OWASP/CWE refs, remediation.
	Title       string `json:"title"`
	Description string `json:"description"`
	OWASP       string `json:"owasp"`        // e.g. "API8:2023"
	CWE         string `json:"cwe"`          // e.g. "CWE-89"
	Remediation string `json:"remediation"`

	// "What this test does" — short paragraph the UI shows on the report
	// page and the PDF prints under each finding. Lets a developer
	// understand WHAT we attacked and HOW even before reading the finding.
	TestExplanation string `json:"test_explanation,omitempty"`

	// Plain-English framing — what the developer-friendly tab leads with.
	PlainTitle           string   `json:"plain_title"`
	PlainWhatsHappening  string   `json:"plain_whats_happening"`
	PlainWhy             string   `json:"plain_why"`
	PlainHowToFix        []string `json:"plain_how_to_fix"`
	Effort               Effort   `json:"effort"`

	// Evidence — request that triggered finding + response snapshot.
	Request      engine.HTTPRequest `json:"request"`
	Response     ResponseSnapshot   `json:"response"`
	EvidenceText string             `json:"evidence_text"`
	Ts           time.Time          `json:"ts"`
}

// Settings captures everything the operator chose at scan-start time.
type Settings struct {
	EnabledCategories []Category    `json:"enabled_categories"`
	RateLimitRPS      int           `json:"rate_limit_rps"`
	MaxDuration       time.Duration `json:"max_duration"`
	SeverityThreshold Severity      `json:"severity_threshold"` // hide findings below this in the report
}

// DefaultSettings returns sensible defaults for a v1 scan: all categories,
// 5 rps, 5-minute cap, info-and-up reported.
func DefaultSettings() Settings {
	return Settings{
		EnabledCategories: []Category{CatTransport, CatInfoDisclosure, CatInjection, CatMethodTampering},
		RateLimitRPS:      5,
		MaxDuration:       5 * time.Minute,
		SeverityThreshold: SevInfo,
	}
}

// Test is the contract every check implements. Run is expected to be
// non-blocking under normal conditions — return promptly and don't spawn
// goroutines without bounding them.
type Test interface {
	ID() string
	Name() string
	Category() Category
	Run(ctx context.Context, t Target, h *http.Client) []Finding
}

// TestResult is what we record for EVERY test that ran during a scan,
// regardless of whether it flagged anything. Lets the UI show "11 tests
// passed, 7 raised findings" so the operator gets visibility into the
// complete VAPT sweep, not just the flagged checks.
type TestResult struct {
	TestID       string   `json:"test_id"`
	Name         string   `json:"name"`
	Category     Category `json:"category"`
	Passed       bool     `json:"passed"`        // true = no findings (test green)
	FindingCount int      `json:"finding_count"`
	DurationMs   int64    `json:"duration_ms"`
}

// SeverityRank gives a numeric ordering useful for sorting + thresholding.
// Higher = worse.
func SeverityRank(s Severity) int {
	switch s {
	case SevCritical:
		return 5
	case SevHigh:
		return 4
	case SevMedium:
		return 3
	case SevLow:
		return 2
	case SevInfo:
		return 1
	}
	return 0
}

// Meets returns true if `s` is at least as severe as `threshold`.
func Meets(s, threshold Severity) bool {
	return SeverityRank(s) >= SeverityRank(threshold)
}
