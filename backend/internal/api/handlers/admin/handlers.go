// Package admin wires the /admin/* HTTP routes (separate from user routes).
package admin

import (
	"crypto/subtle"
	"net/http"

	"github.com/choicetechlab/choicehammer/internal/activity"
	"github.com/choicetechlab/choicehammer/internal/teams"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	Svc      *teams.Service
	AdminKey string
	Activity *activity.Service
}

// audit logs an admin-side mutation to both the admin_audit table (already
// happens via teams.Service.Audit) and the unified activity_log so it shows
// up in the cross-tool activity feed.
func (h *Handler) audit(c *gin.Context, action, resType, resID string, meta map[string]interface{}) {
	if h.Activity == nil {
		return
	}
	if meta == nil {
		meta = map[string]interface{}{}
	}
	meta["action"] = action
	h.Activity.Log(c.Request.Context(), activity.Event{
		ActorType:    "admin",
		ActorName:    "admin",
		EventType:    activity.EventAdminAction,
		ToolSlug:     "admin",
		ResourceType: resType,
		ResourceID:   resID,
		Meta:         meta,
		IP:           c.ClientIP(),
		UA:           c.GetHeader("User-Agent"),
	})
}

// AuthMiddleware validates the X-Admin-Key header on every /api/admin/* route.
func (h *Handler) AuthMiddleware() gin.HandlerFunc {
	expected := []byte(h.AdminKey)
	return func(c *gin.Context) {
		got := c.GetHeader("X-Admin-Key")
		if got == "" {
			got = c.Query("admin_key")
		}
		if got == "" || subtle.ConstantTimeCompare([]byte(got), expected) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid admin key"})
			return
		}
		c.Next()
	}
}

// Auth — POST /api/admin/auth — used by the UI login screen to verify the
// passphrase before showing the console. Body: {"key": "..."}
func (h *Handler) Auth(c *gin.Context) {
	var b struct{ Key string `json:"key"` }
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing key"})
		return
	}
	if subtle.ConstantTimeCompare([]byte(b.Key), []byte(h.AdminKey)) != 1 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wrong admin passphrase"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── Teams ─────────────────────────────────────────────────────────────────
func (h *Handler) ListTeams(c *gin.Context) {
	out, err := h.Svc.ListTeams(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, out)
}

type createBody struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Tools       []string `json:"tools"`
}

func (h *Handler) CreateTeam(c *gin.Context) {
	var b createBody
	if err := c.ShouldBindJSON(&b); err != nil || b.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "team name is required"})
		return
	}
	t, plain, err := h.Svc.CreateTeam(c.Request.Context(), b.Name, b.Description, b.Tools)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.Svc.Audit(c.Request.Context(), "admin", "team.create", "team", t.ID, c.ClientIP(), c.Request.UserAgent())
	h.audit(c, "team.create", "team", t.ID, map[string]interface{}{"name": t.Name, "tools": t.ToolsAccess})
	c.JSON(http.StatusCreated, gin.H{"team": t, "plain_key": plain})
}

func (h *Handler) RotateKey(c *gin.Context) {
	id := c.Param("id")
	plain, err := h.Svc.RotateKey(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.Svc.Audit(c.Request.Context(), "admin", "key.rotate", "team", id, c.ClientIP(), c.Request.UserAgent())
	h.audit(c, "key.rotate", "team", id, nil)
	c.JSON(http.StatusOK, gin.H{"plain_key": plain})
}

func (h *Handler) RenameTeam(c *gin.Context) {
	var b createBody
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id := c.Param("id")
	if err := h.Svc.RenameTeam(c.Request.Context(), id, b.Name, b.Description, b.Tools); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.Svc.Audit(c.Request.Context(), "admin", "team.rename", "team", id, c.ClientIP(), c.Request.UserAgent())
	h.audit(c, "team.rename", "team", id, map[string]interface{}{"name": b.Name, "tools": b.Tools})
	c.Status(http.StatusNoContent)
}

func (h *Handler) DeleteTeam(c *gin.Context) {
	id := c.Param("id")
	if err := h.Svc.DeleteTeam(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.Svc.Audit(c.Request.Context(), "admin", "team.delete", "team", id, c.ClientIP(), c.Request.UserAgent())
	h.audit(c, "team.delete", "team", id, nil)
	c.Status(http.StatusNoContent)
}

// SetActive — POST /api/admin/teams/:id/active   body: {"active": true|false}
func (h *Handler) SetActive(c *gin.Context) {
	var b struct{ Active bool `json:"active"` }
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id := c.Param("id")
	if err := h.Svc.SetActive(c.Request.Context(), id, b.Active); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	action := "team.disable"
	if b.Active { action = "team.enable" }
	h.Svc.Audit(c.Request.Context(), "admin", action, "team", id, c.ClientIP(), c.Request.UserAgent())
	h.audit(c, action, "team", id, map[string]interface{}{"active": b.Active})
	c.Status(http.StatusNoContent)
}

// ── Audit feed ───────────────────────────────────────────────────────────
func (h *Handler) AuditFeed(c *gin.Context) {
	items, err := h.Svc.ListAudit(c.Request.Context(), 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}
