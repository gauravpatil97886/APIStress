package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"net/url"

	"github.com/choicetechlab/choicehammer/internal/platform/activity"
	"github.com/choicetechlab/choicehammer/internal/platform/api/middleware"
	"github.com/choicetechlab/choicehammer/internal/platform/curl"
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/engine"
	"github.com/choicetechlab/choicehammer/internal/platform/logger"
	"github.com/choicetechlab/choicehammer/internal/platform/security"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type RunsHandler struct {
	DB       *pgxpool.Pool
	Manager  *engine.Manager
	Activity *activity.Service
}

type startBody struct {
	TestID         string                 `json:"test_id"`
	Curl           string                 `json:"curl"`
	Config         *engine.TestConfig     `json:"config"`
	CreatedBy      string                 `json:"created_by"`
	JiraID         string                 `json:"jira_id"`
	JiraLink       string                 `json:"jira_link"`
	Notes          string                 `json:"notes"`
	EnvTag         string                 `json:"env_tag"`
	CostInputs     map[string]interface{} `json:"cost_inputs"`
	AutoAttachJira bool                   `json:"auto_attach_jira"`
}

func (h *RunsHandler) Start(c *gin.Context) {
	var body startBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Could not read your request — it isn't valid JSON."})
		return
	}

	cfg := body.Config
	testID := body.TestID

	if testID != "" && cfg == nil {
		// Team-scope the lookup — without it a team could load (and run)
		// another team's saved test config, leaking the URL / headers /
		// any auth tokens baked into the request.
		teamForTestLookup := middleware.TeamID(c)
		row := h.DB.QueryRow(c.Request.Context(),
			`SELECT config FROM tests WHERE id=$1 AND team_id=$2`, testID, teamForTestLookup)
		var raw []byte
		if err := row.Scan(&raw); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "test not found"})
			return
		}
		cfg = &engine.TestConfig{}
		if err := json.Unmarshal(raw, cfg); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if cfg == nil {
		cfg = &engine.TestConfig{}
	}
	if body.Curl != "" {
		req, err := curl.Parse(body.Curl)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Could not parse the curl command. Make sure it starts with 'curl' and the URL is in quotes. Detail: " + err.Error(),
			})
			return
		}
		cfg.Request = *req
		if cfg.Protocol == "" {
			cfg.Protocol = engine.ProtoHTTP
		}
	}

	if strings.TrimSpace(body.CreatedBy) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Please enter your name before starting a test."})
		return
	}
	if strings.TrimSpace(body.JiraID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Please enter the Jira ticket ID (e.g. CT-1234)."})
		return
	}
	if cfg.Request.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No target URL provided. Paste a curl or fill in the URL field."})
		return
	}
	if !strings.HasPrefix(cfg.Request.URL, "http://") && !strings.HasPrefix(cfg.Request.URL, "https://") &&
		!strings.HasPrefix(cfg.Request.URL, "ws://") && !strings.HasPrefix(cfg.Request.URL, "wss://") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "URL must start with http://, https://, ws:// or wss://"})
		return
	}
	// SSRF awareness: APIStress is lenient because load testing internal
	// services is a legitimate workflow — but we still log a warning so
	// the admin's activity feed surfaces "team X just hammered an
	// RFC1918 address from the backend host" if it ever happens.
	if u, perr := url.Parse(cfg.Request.URL); perr == nil && security.IsBlockedHost(u.Host) {
		logger.Warn("apistress run targets private/loopback host",
			zap.String("host", u.Host),
			zap.String("created_by", body.CreatedBy),
			zap.String("team", middleware.TeamID(c)))
	}
	envTag := strings.TrimSpace(body.EnvTag)
	if envTag != "" {
		ok := false
		for _, allowed := range []string{"Production", "Broking", "UAT"} {
			if envTag == allowed {
				ok = true
				break
			}
		}
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "env_tag must be one of: Production, Broking, UAT"})
			return
		}
	}
	meta := engine.RunMeta{
		CreatedBy:      body.CreatedBy,
		JiraID:         body.JiraID,
		JiraLink:       body.JiraLink,
		Notes:          body.Notes,
		EnvTag:         envTag,
		CostInputs:     body.CostInputs,
		AutoAttachJira: body.AutoAttachJira,
	}

	teamID := middleware.TeamID(c)
	mr, err := h.Manager.Start(c.Request.Context(), cfg, testID, meta, teamID)
	if err != nil {
		logger.Error("manager.Start failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if h.Activity != nil {
		h.Activity.Log(c.Request.Context(), activity.Event{
			TeamID:       teamID,
			ActorType:    "user",
			ActorName:    body.CreatedBy,
			EventType:    activity.EventRunStart,
			ToolSlug:     "apistress",
			ResourceType: "run",
			ResourceID:   mr.ID,
			Meta: map[string]interface{}{
				"name":     cfg.Name,
				"vus":      cfg.VUs,
				"jira":     body.JiraID,
				"env":      envTag,
			},
			IP: c.ClientIP(),
			UA: c.GetHeader("User-Agent"),
		})
	}
	c.JSON(http.StatusAccepted, gin.H{"run_id": mr.ID})
}

func (h *RunsHandler) Stop(c *gin.Context) {
	id := c.Param("id")
	team := middleware.TeamID(c)
	if mr, ok := h.Manager.Get(id); ok {
		if team != "" && mr.TeamID != "" && mr.TeamID != team {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
	}
	if !h.Manager.Stop(id) {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not active"})
		return
	}
	logger.Info("run stop requested", zap.String("run_id", id))
	if h.Activity != nil {
		h.Activity.Log(c.Request.Context(), activity.Event{
			TeamID:       team,
			ActorType:    "user",
			EventType:    activity.EventRunStop,
			ToolSlug:     "apistress",
			ResourceType: "run",
			ResourceID:   id,
			IP:           c.ClientIP(),
			UA:           c.GetHeader("User-Agent"),
		})
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RunsHandler) Status(c *gin.Context) {
	id := c.Param("id")
	team := middleware.TeamID(c)
	if mr, ok := h.Manager.Get(id); ok {
		if team != "" && mr.TeamID != "" && mr.TeamID != team {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"id":         mr.ID,
			"name":       mr.Cfg.Name,
			"status":     string(mr.Status),
			"started_at": mr.StartedAt,
			"active_vus": mr.Runner.Collector.ActiveVUs(),
			"totals":     mr.Runner.Collector.Totals(),
			"created_by": mr.Meta.CreatedBy,
			"jira_id":    mr.Meta.JiraID,
			"jira_link":  mr.Meta.JiraLink,
			"notes":      mr.Meta.Notes,
			"env_tag":    mr.Meta.EnvTag,
		})
		return
	}
	row := h.DB.QueryRow(c.Request.Context(),
		`SELECT id, name, status, started_at, finished_at, summary, created_by, jira_id, jira_link, notes, config, env_tag
		   FROM runs WHERE id=$1 AND team_id=$2`, id, team)
	var rid, name, status, createdBy, jiraID, jiraLink, notes, envTag string
	var started, finished *time.Time
	var summary, cfgRaw []byte
	if err := row.Scan(&rid, &name, &status, &started, &finished, &summary, &createdBy, &jiraID, &jiraLink, &notes, &cfgRaw, &envTag); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var sum, cfg interface{}
	_ = json.Unmarshal(summary, &sum)
	_ = json.Unmarshal(cfgRaw, &cfg)
	c.JSON(http.StatusOK, gin.H{
		"id": rid, "name": name, "status": status,
		"started_at": started, "finished_at": finished,
		"summary":    sum,
		"config":     cfg,
		"created_by": createdBy,
		"jira_id":    jiraID,
		"jira_link":  jiraLink,
		"notes":      notes,
		"env_tag":    envTag,
	})
}

func (h *RunsHandler) List(c *gin.Context) {
	team := middleware.TeamID(c)
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, name, status, started_at, finished_at, summary, created_by, jira_id, jira_link, config, env_tag
		   FROM runs WHERE team_id=$1 ORDER BY created_at DESC LIMIT 200`, team)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := []gin.H{}
	for rows.Next() {
		var id, name, status, createdBy, jiraID, jiraLink, envTag string
		var started, finished *time.Time
		var summary, cfgRaw []byte
		if err := rows.Scan(&id, &name, &status, &started, &finished, &summary, &createdBy, &jiraID, &jiraLink, &cfgRaw, &envTag); err != nil {
			logger.Warn("listRuns scan failed", zap.Error(err))
			continue
		}
		var sum, cfg interface{}
		_ = json.Unmarshal(summary, &sum)
		_ = json.Unmarshal(cfgRaw, &cfg)
		out = append(out, gin.H{
			"id": id, "name": name, "status": status,
			"started_at": started, "finished_at": finished,
			"summary":    sum,
			"config":     cfg,
			"created_by": createdBy,
			"jira_id":    jiraID,
			"jira_link":  jiraLink,
			"env_tag":    envTag,
		})
	}
	c.JSON(http.StatusOK, out)
}
