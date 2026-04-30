package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// KeyAuth is a single shared-key auth middleware.
// Accepts the key in the Authorization header ("Bearer <key>" or raw),
// in X-Access-Key header, or in the ?key= query param.
func KeyAuth(expected string) gin.HandlerFunc {
	expBytes := []byte(expected)
	return func(c *gin.Context) {
		got := extractKey(c)
		if got == "" || subtle.ConstantTimeCompare([]byte(got), expBytes) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid access key"})
			return
		}
		c.Next()
	}
}

func extractKey(c *gin.Context) string {
	if h := c.GetHeader("X-Access-Key"); h != "" {
		return h
	}
	if h := c.GetHeader("Authorization"); h != "" {
		if strings.HasPrefix(h, "Bearer ") {
			return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
		}
		return h
	}
	if q := c.Query("key"); q != "" {
		return q
	}
	return ""
}
