package handlers

import (
	"crypto/subtle"
	"net/http"

	"github.com/choicetechlab/choicehammer/internal/logger"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

type AuthHandler struct {
	ExpectedKey string
}

// Login validates an access key and returns it back as the session token.
// The frontend stores it in localStorage and sends it in X-Access-Key.
func (h *AuthHandler) Login(c *gin.Context) {
	var body struct {
		Key string `json:"key"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing key"})
		return
	}
	if body.Key == "" || subtle.ConstantTimeCompare([]byte(body.Key), []byte(h.ExpectedKey)) != 1 {
		logger.Warn("login failed: invalid key", zap.String("ip", c.ClientIP()))
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid key"})
		return
	}
	logger.Info("login success", zap.String("ip", c.ClientIP()))
	c.JSON(http.StatusOK, gin.H{"ok": true, "token": body.Key})
}

func (h *AuthHandler) Verify(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
