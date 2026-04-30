package middleware

import (
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORS returns a gin handler that allows the supplied list of origins.
// When `allowed` is empty (default for dev) it falls back to a permissive
// allow-all — convenient for local hacking but explicitly NOT recommended
// for any deployment that's reachable beyond the developer's laptop.
//
// Operators set CH_ALLOWED_ORIGINS to a comma-separated list at deploy
// time, e.g.
//
//	CH_ALLOWED_ORIGINS=https://tools.choicetechlab.com,https://internal.choicetechlab.com
//
// Origins are matched exactly (no wildcard subdomain magic) so a typo
// surfaces quickly rather than silently widening the policy.
func CORS(allowed []string) gin.HandlerFunc {
	cleaned := make([]string, 0, len(allowed))
	for _, o := range allowed {
		o = strings.TrimSpace(o)
		if o != "" {
			cleaned = append(cleaned, o)
		}
	}
	cfg := cors.Config{
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Access-Key", "X-Admin-Key"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	if len(cleaned) == 0 {
		// No allow-list configured — fall back to allow-all so dev keeps
		// working out of the box. Operators are expected to set
		// CH_ALLOWED_ORIGINS in any non-trusted environment.
		cfg.AllowOriginFunc = func(origin string) bool { return true }
	} else {
		set := make(map[string]bool, len(cleaned))
		for _, o := range cleaned {
			set[o] = true
		}
		cfg.AllowOriginFunc = func(origin string) bool { return set[origin] }
	}
	return cors.New(cfg)
}
