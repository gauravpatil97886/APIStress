package handlers

import (
	"net/http"

	"github.com/choicetechlab/choicehammer/internal/platform/activity"
	"github.com/choicetechlab/choicehammer/internal/platform/api/middleware"
	"github.com/gin-gonic/gin"
)

// ActivityHandler exposes a thin endpoint that lets the frontend log
// client-side events the backend can't see by itself: tool opens, logout
// clicks, Crosswalk joins, file exports, etc. The team is taken from the
// authenticated context — clients can never log to a team they don't own.
type ActivityHandler struct {
	Svc *activity.Service
}

type clientEventBody struct {
	EventType    string                 `json:"event_type"`
	ToolSlug     string                 `json:"tool_slug"`
	ResourceType string                 `json:"resource_type"`
	ResourceID   string                 `json:"resource_id"`
	ActorName    string                 `json:"actor_name"`
	Meta         map[string]interface{} `json:"meta"`
}

// Allow-list — we don't want clients spamming arbitrary event names that
// would pollute the admin dashboard or be used to mock other systems.
var clientAllowedEvents = map[string]bool{
	"auth.logout":             true,
	"tool.open":               true,
	"feature.crosswalk.upload": true,
	"feature.crosswalk.join":   true,
	"feature.crosswalk.export": true,
	"feature.runner.start":    true,
	"feature.runner.export":   true,
	"feature.pw.export":       true,
	"feature.jira.attach":     true,
	"feature.kavach.scan.start":      true,
	"feature.kavach.scan.export":     true,
	"feature.kavach.finding.filed":   true,
	"feature.kavach.report.attached": true,
}

func (h *ActivityHandler) Log(c *gin.Context) {
	var body clientEventBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if !clientAllowedEvents[body.EventType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown event_type"})
		return
	}
	team := middleware.TeamID(c)
	teamName := middleware.TeamName(c)
	if body.ActorName == "" {
		body.ActorName = teamName
	}
	h.Svc.Log(c.Request.Context(), activity.Event{
		TeamID:       team,
		ActorType:    "user",
		ActorName:    body.ActorName,
		EventType:    body.EventType,
		ToolSlug:     body.ToolSlug,
		ResourceType: body.ResourceType,
		ResourceID:   body.ResourceID,
		Meta:         body.Meta,
		IP:           c.ClientIP(),
		UA:           c.GetHeader("User-Agent"),
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
