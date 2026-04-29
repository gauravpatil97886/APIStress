package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/choicetechlab/choicehammer/internal/api/middleware"
	"github.com/choicetechlab/choicehammer/internal/engine"
	"github.com/choicetechlab/choicehammer/internal/logger"
	"github.com/choicetechlab/choicehammer/internal/metrics"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

type LiveHandler struct {
	Manager *engine.Manager
}

// Stream is an SSE endpoint emitting one event per second with the latest
// metrics for the run, plus a final "done" event.
func (h *LiveHandler) Stream(c *gin.Context) {
	id := c.Param("id")
	mr, ok := h.Manager.Get(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not found or already finished"})
		return
	}
	team := middleware.TeamID(c)
	if team != "" && mr.TeamID != "" && mr.TeamID != team {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(http.StatusOK)
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming unsupported"})
		return
	}

	sub := mr.Subscribe()
	defer mr.Unsubscribe(sub)
	logger.Info("sse subscriber attached", zap.String("run_id", id), zap.String("ip", c.ClientIP()))

	// send initial snapshot immediately
	writeEvent(c.Writer, flusher, "snapshot", metrics.BuildLiveSnapshot(id, string(mr.Status), mr.Runner.Collector))

	keepalive := time.NewTicker(15 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			logger.Info("sse client disconnected", zap.String("run_id", id))
			return
		case b, ok := <-*sub:
			if !ok {
				snap := metrics.BuildLiveSnapshot(id, string(mr.Status), mr.Runner.Collector)
				writeEvent(c.Writer, flusher, "done", snap)
				return
			}
			snap := metrics.BuildLiveSnapshot(id, string(mr.Status), mr.Runner.Collector)
			snap.Latest = b
			writeEvent(c.Writer, flusher, "tick", snap)
		case <-keepalive.C:
			_, _ = io.WriteString(c.Writer, ": ping\n\n")
			flusher.Flush()
		}
	}
}

func writeEvent(w io.Writer, f http.Flusher, event string, data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		return
	}
	_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload)
	f.Flush()
}
