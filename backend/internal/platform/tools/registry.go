// Package tools is the canonical registry of internal tools that the
// platform exposes. Every team's `tools_access` slice is validated against
// this list. Adding a new tool = adding one entry to AllSlugs (plus the
// frontend page + registry entry).
//
// We deliberately keep this as a flat slug list — the backend doesn't care
// about labels, icons, or routes. Those live in the frontend registry.
package tools

// AllSlugs is the authoritative set of tool identifiers. Order is irrelevant.
var AllSlugs = []string{
	"apistress",
	"postwomen",
	"crosswalk",
	"kavach",
}

// IsAllowed returns true if `slug` is a known tool.
func IsAllowed(slug string) bool {
	for _, s := range AllSlugs {
		if s == slug {
			return true
		}
	}
	return false
}
