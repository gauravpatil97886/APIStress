package middleware

import (
	"net/http"

	"github.com/choicetechlab/choicehammer/internal/teams"
	"github.com/gin-gonic/gin"
)

const (
	CtxTeamID   = "team_id"
	CtxTeamName = "team_name"
)

// TeamAuth replaces the old fixed-key auth with team-scoped auth.
// On a valid key it stashes team_id + team_name in the gin context so
// every downstream handler can read them via TeamID(c) / TeamName(c).
func TeamAuth(svc *teams.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := extractKey(c)
		if key == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing access key"})
			return
		}
		t, err := svc.Authenticate(c.Request.Context(), key)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid access key"})
			return
		}
		c.Set(CtxTeamID, t.ID)
		c.Set(CtxTeamName, t.Name)
		c.Next()
	}
}

// extractKey is provided by auth.go (same package).

// TeamID extracts the team id set by TeamAuth. Returns "" when unset
// (caller should treat that as a programming error).
func TeamID(c *gin.Context) string {
	v, _ := c.Get(CtxTeamID)
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func TeamName(c *gin.Context) string {
	v, _ := c.Get(CtxTeamName)
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
