package handlers

import (
	"net/http"

	"github.com/choicetechlab/choicehammer/internal/platform/activity"
	"github.com/choicetechlab/choicehammer/internal/platform/api/middleware"
	"github.com/choicetechlab/choicehammer/internal/platform/logger"
	"github.com/choicetechlab/choicehammer/internal/platform/teams"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

type AuthHandler struct {
	Teams    *teams.Service
	Activity *activity.Service
}

// Login validates an access key against team_keys and returns the team info
// the frontend uses to display the team chip.
func (h *AuthHandler) Login(c *gin.Context) {
	var body struct {
		Key string `json:"key"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing key"})
		return
	}
	t, err := h.Teams.Authenticate(c.Request.Context(), body.Key)
	if err != nil {
		logger.Warn("login failed", zap.String("ip", c.ClientIP()), zap.Error(err))
		if h.Activity != nil {
			h.Activity.Log(c.Request.Context(), activity.Event{
				ActorType: "user",
				EventType: activity.EventLoginFailed,
				ToolSlug:  "",
				IP:        c.ClientIP(),
				UA:        c.GetHeader("User-Agent"),
			})
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid access key"})
		return
	}
	logger.Info("login success",
		zap.String("ip", c.ClientIP()),
		zap.String("team", t.Name),
	)
	if h.Activity != nil {
		h.Activity.Log(c.Request.Context(), activity.Event{
			TeamID:    t.ID,
			ActorType: "user",
			ActorName: t.Name,
			EventType: activity.EventLogin,
			IP:        c.ClientIP(),
			UA:        c.GetHeader("User-Agent"),
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"ok":    true,
		"token": body.Key,
		"team": gin.H{
			"id":           t.ID,
			"name":         t.Name,
			"description":  t.Description,
			"tools_access": t.ToolsAccess,
		},
	})
}

func (h *AuthHandler) Verify(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"ok":   true,
		"team": gin.H{"id": middleware.TeamID(c), "name": middleware.TeamName(c)},
	})
}
