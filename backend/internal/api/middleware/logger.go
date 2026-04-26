package middleware

import (
	"time"

	"github.com/choicetechlab/choicehammer/internal/logger"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// RequestLogger logs every HTTP request with timing, status, size and client info.
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery
		c.Next()
		latency := time.Since(start)
		status := c.Writer.Status()
		size := c.Writer.Size()
		fullPath := path
		if raw != "" {
			fullPath = path + "?" + raw
		}
		fields := []zap.Field{
			zap.String("method", c.Request.Method),
			zap.String("path", fullPath),
			zap.Int("status", status),
			zap.Int("size", size),
			zap.Duration("latency", latency),
			zap.String("ip", c.ClientIP()),
			zap.String("ua", c.Request.UserAgent()),
		}
		if errs := c.Errors.ByType(gin.ErrorTypePrivate).String(); errs != "" {
			fields = append(fields, zap.String("errors", errs))
		}
		switch {
		case status >= 500:
			logger.Error("http request", fields...)
		case status >= 400:
			logger.Warn("http request", fields...)
		default:
			logger.Info("http request", fields...)
		}
	}
}

// Recovery converts panics into 500s and logs them with stack.
func Recovery() gin.HandlerFunc {
	return gin.CustomRecoveryWithWriter(nil, func(c *gin.Context, err interface{}) {
		logger.Error("panic recovered",
			zap.Any("error", err),
			zap.String("path", c.Request.URL.Path),
			zap.String("method", c.Request.Method),
		)
		c.AbortWithStatusJSON(500, gin.H{"error": "internal server error"})
	})
}
