package middleware

import "github.com/gin-gonic/gin"

// SecurityHeaders sets the conservative defaults every internal-tool
// response should ship with. Cheap belt-and-braces against MIME-sniffing,
// click-jacking, and Referer leakage between tabs.
//
// We deliberately don't set a strict CSP here — the React app inlines a
// non-trivial amount of CSS-in-JS and the admin's report iframe loads
// HTML reports rendered server-side. A hand-tuned CSP belongs alongside
// a dedicated frontend hardening pass; until then these three headers
// give us the highest-value, lowest-friction wins.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		c.Next()
	}
}
