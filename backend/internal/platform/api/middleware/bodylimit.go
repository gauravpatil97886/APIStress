package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// MaxBytes installs an http.MaxBytesReader on every request body so a
// runaway upload or malformed Content-Length can't blow up the process
// memory. Gin's binding helpers already cap multipart memory for forms,
// but JSON bodies (which most of our handlers consume) had no explicit
// ceiling — this closes that hole.
//
// The default of 32 MiB is generous for our largest legitimate JSON
// payloads (a Postman collection import, a curl with a big JSON body)
// while still being a hard stop against accidental gigabyte uploads.
func MaxBytes(limitBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request != nil && c.Request.Body != nil && limitBytes > 0 {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limitBytes)
		}
		c.Next()
	}
}
