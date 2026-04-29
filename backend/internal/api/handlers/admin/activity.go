package admin

import (
	"net/http"
	"strconv"

	"github.com/choicetechlab/choicehammer/internal/activity"
	"github.com/gin-gonic/gin"
)

// AddActivityRoutes wires the admin-only activity feed + stats under
// /api/admin/activity*. The caller is responsible for putting these inside
// the admin auth group.
type ActivityHandler struct {
	Svc *activity.Service
}

func (h *ActivityHandler) Feed(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "200"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	items, err := h.Svc.List(c.Request.Context(), activity.ListFilter{
		TeamID:    c.Query("team_id"),
		ToolSlug:  c.Query("tool"),
		EventType: c.Query("event"),
		Search:    c.Query("q"),
		SinceISO:  c.Query("since"),
		UntilISO:  c.Query("until"),
		Limit:     limit,
		Offset:    offset,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *ActivityHandler) Stats(c *gin.Context) {
	hours, _ := strconv.Atoi(c.DefaultQuery("hours", "168"))
	stats, err := h.Svc.Stats(c.Request.Context(), hours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}
