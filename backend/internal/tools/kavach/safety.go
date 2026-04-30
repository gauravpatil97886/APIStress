package kavach

import (
	"regexp"
	"strings"
	"time"
)

// MaxEvidenceBytes is the hard cap on `evidence_text` we'll persist per
// finding. Stops a single misbehaving response from bloating the DB.
const MaxEvidenceBytes = 2 * 1024

// MaxBodyBytes is the cap on `response_snapshot.body`. Bigger than
// MaxEvidenceBytes because the user might want to read the full response
// in the inspector drawer.
const MaxBodyBytes = 8 * 1024

// HardRateLimitCeiling is the maximum allowed RPS regardless of what the
// operator picks in the UI — guards against accidental DoS of the target.
const HardRateLimitCeiling = 50

// HardDurationCeiling — a single scan can never run longer than this even
// if the operator drags the slider to the end.
const HardDurationCeiling = 30 * time.Minute

// sensitiveHeaderRE matches header NAMES whose value should be redacted
// before we persist or display. We keep the header present (so the
// reproducer is honest about which headers were sent) but mask the value.
var sensitiveHeaderRE = regexp.MustCompile(`(?i)^(authorization|cookie|x-api[-_ ]?key|api[-_ ]?key|x-auth[-_ ]?token|access[-_ ]?token|secret|password)$`)

// jwtRE matches a likely JWT (three base64url segments joined with dots,
// starting with `eyJ` because every JWT header begins `{"alg":…}` →
// base64url `eyJ…`).
var jwtRE = regexp.MustCompile(`eyJ[\w-]+\.[\w-]+\.[\w-]+`)

// keyShapeRE matches common cloud / SaaS API-key formats so we never
// persist them by accident in evidence text.
var keyShapeRE = regexp.MustCompile(
	`AKIA[0-9A-Z]{16}|` + // AWS access key id
		`sk_live_[A-Za-z0-9]{16,}|` + // Stripe live secret
		`xox[baprs]-[A-Za-z0-9-]{10,}|` + // Slack tokens
		`ghp_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|` + // GitHub PATs
		`gh[ousp]_[A-Za-z0-9]{36}`, // GitHub fine-grained tokens
)

// RedactHeaders masks the values of known-sensitive header names. Returns
// a fresh map so callers can safely use the result alongside the original.
func RedactHeaders(in map[string]string) map[string]string {
	out := make(map[string]string, len(in))
	for k, v := range in {
		if sensitiveHeaderRE.MatchString(strings.TrimSpace(k)) {
			out[k] = "<redacted>"
			continue
		}
		out[k] = v
	}
	return out
}

// RedactBody masks JWT-shaped tokens and known API-key formats inside a
// response/request body string. Cheap regex-only — it's a backstop, not a
// guarantee. Don't rely on this for compliance-grade scrubbing.
func RedactBody(s string) string {
	s = jwtRE.ReplaceAllString(s, "[REDACTED:JWT]")
	s = keyShapeRE.ReplaceAllString(s, "[REDACTED:KEY]")
	return s
}

// TruncateBody trims a response body to MaxBodyBytes and reports whether
// truncation happened so the UI can show a "..." marker.
func TruncateBody(b string) (string, bool) {
	if len(b) <= MaxBodyBytes {
		return b, false
	}
	return b[:MaxBodyBytes], true
}

// TruncateEvidence trims evidence_text to MaxEvidenceBytes.
func TruncateEvidence(s string) string {
	if len(s) <= MaxEvidenceBytes {
		return s
	}
	return s[:MaxEvidenceBytes-1] + "…"
}
