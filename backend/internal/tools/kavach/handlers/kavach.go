package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/choicetechlab/choicehammer/internal/platform/activity"
	"github.com/choicetechlab/choicehammer/internal/platform/api/middleware"
	"github.com/choicetechlab/choicehammer/internal/platform/curl"
	"github.com/choicetechlab/choicehammer/internal/platform/jira"
	"github.com/choicetechlab/choicehammer/internal/platform/logger"
	"github.com/choicetechlab/choicehammer/internal/platform/security"
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/engine"
	"github.com/choicetechlab/choicehammer/internal/tools/kavach"
)

type KavachHandler struct {
	DB       *pgxpool.Pool
	Mgr      *kavach.Manager
	Activity *activity.Service
	Jira     *jira.Client // nil when Jira integration not configured
	// AllowPrivate disables the SSRF gate so internal-only deployments
	// can deliberately scan loopback / RFC1918 / link-local hosts. Off
	// by default; set CH_KAVACH_ALLOW_PRIVATE=true to enable.
	AllowPrivate bool
}

type startScanBody struct {
	Curl            string              `json:"curl"`
	Request         *engine.HTTPRequest `json:"request"`
	CreatedBy       string              `json:"created_by"`
	JiraID          string              `json:"jira_id"`   // optional, like APIStress
	JiraLink        string              `json:"jira_link"` // optional, auto-fills from jira_id lookup
	Notes           string              `json:"notes"`     // optional free-text
	Categories      []string            `json:"categories"`
	RateLimitRPS    int                 `json:"rate_limit_rps"`
	MaxDurationSec  int                 `json:"max_duration_sec"`
	SeverityThresh  string              `json:"severity_threshold"`
	ConfirmHostname string              `json:"confirm_hostname"`
}

// Start — POST /api/kavach/scans
func (h *KavachHandler) Start(c *gin.Context) {
	var body startScanBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "could not parse request: " + err.Error()})
		return
	}
	teamID := middleware.TeamID(c)

	// Resolve the request — either parse curl or take the structured form.
	var req engine.HTTPRequest
	if strings.TrimSpace(body.Curl) != "" {
		parsed, err := curl.Parse(body.Curl)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "couldn't parse the curl command: " + err.Error()})
			return
		}
		req = *parsed
	} else if body.Request != nil {
		req = *body.Request
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "supply either `curl` or `request`"})
		return
	}
	if req.Method == "" {
		req.Method = "GET"
	}
	if !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "URL must start with http:// or https://"})
		return
	}

	target, err := kavach.BuildTarget(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// SSRF gate: refuse to fan out attack payloads at loopback / RFC1918
	// / link-local hosts. The OPERATOR'S target URL is checked; the
	// individual test payloads (which legitimately probe e.g.
	// 169.254.169.254 to confirm cloud-metadata isn't reachable) are
	// unaffected. Bypass requires CH_KAVACH_ALLOW_PRIVATE=true.
	if !h.AllowPrivate && security.IsBlockedHost(target.Host) {
		logger.Warn("kavach scan refused: target resolves to private/loopback",
			zap.String("host", target.Host),
			zap.String("team", teamID))
		c.JSON(http.StatusForbidden, gin.H{
			"error": "target host resolves to a private, loopback or link-local address — refusing to scan. " +
				"Set CH_KAVACH_ALLOW_PRIVATE=true on the server to allow scanning internal infra.",
			"host": target.Host,
		})
		return
	}

	// Safety: confirm-host gate. The frontend asks the user to type the
	// hostname before allowing "Run scan"; the backend re-validates here so
	// programmatic API clients can't skip it.
	if strings.ToLower(strings.TrimSpace(body.ConfirmHostname)) != strings.ToLower(target.Host) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "confirm_hostname must match the target hostname exactly (case-insensitive). " +
				"This is a deliberate friction step so you can't accidentally fire attacks at the wrong host.",
			"expected": target.Host,
		})
		return
	}

	settings := kavach.DefaultSettings()
	if len(body.Categories) > 0 {
		settings.EnabledCategories = settings.EnabledCategories[:0]
		for _, c := range body.Categories {
			settings.EnabledCategories = append(settings.EnabledCategories, kavach.Category(c))
		}
	}
	if body.RateLimitRPS > 0 {
		settings.RateLimitRPS = body.RateLimitRPS
	}
	if body.MaxDurationSec > 0 {
		settings.MaxDuration = time.Duration(body.MaxDurationSec) * time.Second
	}
	if body.SeverityThresh != "" {
		settings.SeverityThreshold = kavach.Severity(body.SeverityThresh)
	}

	scan, err := h.Mgr.Start(c.Request.Context(), teamID, target, settings, body.CreatedBy)
	if err != nil {
		logger.Error("kavach manager start failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Stamp Jira / notes metadata onto the freshly-inserted row. Done as a
	// follow-up UPDATE so we don't have to widen the kavach.Manager.Start
	// signature for what's effectively scan-side display data.
	if strings.TrimSpace(body.JiraID) != "" || strings.TrimSpace(body.JiraLink) != "" || strings.TrimSpace(body.Notes) != "" {
		if _, err := h.DB.Exec(c.Request.Context(),
			`UPDATE vapt_scans SET jira_id = $1, jira_link = $2, notes = $3 WHERE id = $4`,
			strings.TrimSpace(body.JiraID), strings.TrimSpace(body.JiraLink), strings.TrimSpace(body.Notes), scan.ID,
		); err != nil {
			logger.Warn("kavach jira metadata stamp failed", zap.String("scan_id", scan.ID), zap.Error(err))
		}
	}
	if h.Activity != nil {
		h.Activity.Log(c.Request.Context(), activity.Event{
			TeamID:       teamID,
			ActorType:    "user",
			ActorName:    body.CreatedBy,
			EventType:    "feature.kavach.scan.start",
			ToolSlug:     "kavach",
			ResourceType: "scan",
			ResourceID:   scan.ID,
			Meta: map[string]interface{}{
				"host":       target.Host,
				"categories": settings.EnabledCategories,
				"rate_rps":   settings.RateLimitRPS,
			},
			IP: c.ClientIP(), UA: c.GetHeader("User-Agent"),
		})
	}
	c.JSON(http.StatusAccepted, gin.H{"scan_id": scan.ID})
}

// List — GET /api/kavach/scans
func (h *KavachHandler) List(c *gin.Context) {
	teamID := middleware.TeamID(c)
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, target_url, target_host, status, started_at, finished_at, summary, created_by,
		        jira_id, jira_link, notes
		   FROM vapt_scans
		  WHERE team_id = $1
		  ORDER BY started_at DESC
		  LIMIT 200`, teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := []gin.H{}
	for rows.Next() {
		var id, url, host, status, createdBy, jiraID, jiraLink, notes string
		var started time.Time
		var finished *time.Time
		var summaryRaw []byte
		if err := rows.Scan(&id, &url, &host, &status, &started, &finished, &summaryRaw, &createdBy,
			&jiraID, &jiraLink, &notes); err != nil {
			continue
		}
		var summary interface{}
		_ = json.Unmarshal(summaryRaw, &summary)
		out = append(out, gin.H{
			"id":          id,
			"target_url":  url,
			"target_host": host,
			"status":      status,
			"started_at":  started.Format(time.RFC3339),
			"finished_at": finished,
			"summary":     summary,
			"created_by":  createdBy,
			"jira_id":     jiraID,
			"jira_link":   jiraLink,
			"notes":       notes,
		})
	}
	c.JSON(http.StatusOK, out)
}

// Get — GET /api/kavach/scans/:id
// Returns scan + findings (full evidence) + jira links.
func (h *KavachHandler) Get(c *gin.Context) {
	teamID := middleware.TeamID(c)
	id := c.Param("id")
	row := h.DB.QueryRow(c.Request.Context(),
		`SELECT id, target_url, target_host, status, started_at, finished_at,
		        request_snapshot, settings, summary, created_by,
		        jira_id, jira_link, notes
		   FROM vapt_scans
		  WHERE id = $1 AND team_id = $2`, id, teamID)
	var sid, url, host, status, createdBy, jiraID, jiraLink, notes string
	var started time.Time
	var finished *time.Time
	var reqRaw, settingsRaw, summaryRaw []byte
	if err := row.Scan(&sid, &url, &host, &status, &started, &finished, &reqRaw, &settingsRaw, &summaryRaw, &createdBy,
		&jiraID, &jiraLink, &notes); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "scan not found"})
		return
	}
	frows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, severity, category, test_id, title, description,
		        plain_title, plain_whats_happening, plain_why, plain_how_to_fix, effort,
		        request_snapshot, response_snapshot, evidence_text,
		        owasp, cwe, remediation, test_explanation, ts
		   FROM vapt_findings
		  WHERE scan_id = $1 AND team_id = $2
		  ORDER BY
		    CASE severity
		      WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3
		      WHEN 'low' THEN 2 WHEN 'info' THEN 1 ELSE 0 END DESC,
		    ts ASC`, id, teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer frows.Close()
	findings := []gin.H{}
	for frows.Next() {
		var fid int64
		var sev, cat, tid, title, desc, ptitle, pwhat, pwhy, effort, owasp, cwe, remed, ev, testExp string
		var howRaw, reqJ, respJ []byte
		var ts time.Time
		if err := frows.Scan(&fid, &sev, &cat, &tid, &title, &desc, &ptitle, &pwhat, &pwhy, &howRaw, &effort,
			&reqJ, &respJ, &ev, &owasp, &cwe, &remed, &testExp, &ts); err != nil {
			continue
		}
		// Older rows (pre-explanation column) get a runtime fallback so the
		// UI never has an empty "What we tried" tab.
		if strings.TrimSpace(testExp) == "" {
			testExp = kavach.ExplainTest(tid)
		}
		var howSteps []string
		_ = json.Unmarshal(howRaw, &howSteps)
		var reqObj, respObj interface{}
		_ = json.Unmarshal(reqJ, &reqObj)
		_ = json.Unmarshal(respJ, &respObj)
		findings = append(findings, gin.H{
			"id": fid, "severity": sev, "category": cat, "test_id": tid,
			"title": title, "description": desc,
			"plain_title": ptitle, "plain_whats_happening": pwhat, "plain_why": pwhy,
			"plain_how_to_fix": howSteps, "effort": effort,
			"request": reqObj, "response": respObj, "evidence_text": ev,
			"owasp": owasp, "cwe": cwe, "remediation": remed,
			"test_explanation": testExp,
			"ts":               ts.Format(time.RFC3339),
		})
	}

	var reqObj, settingsObj, summaryObj interface{}
	_ = json.Unmarshal(reqRaw, &reqObj)
	_ = json.Unmarshal(settingsRaw, &settingsObj)
	_ = json.Unmarshal(summaryRaw, &summaryObj)

	c.JSON(http.StatusOK, gin.H{
		"id":          sid,
		"target_url":  url,
		"target_host": host,
		"status":      status,
		"started_at":  started.Format(time.RFC3339),
		"finished_at": finished,
		"request":     reqObj,
		"settings":    settingsObj,
		"summary":     summaryObj,
		"created_by":  createdBy,
		"jira_id":     jiraID,
		"jira_link":   jiraLink,
		"notes":       notes,
		"findings":    findings,
	})
}

// Stop — POST /api/kavach/scans/:id/stop
func (h *KavachHandler) Stop(c *gin.Context) {
	id := c.Param("id")
	team := middleware.TeamID(c)
	if scan, ok := h.Mgr.Get(id); ok {
		if team != "" && scan.TeamID != team {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
	}
	if !h.Mgr.Stop(id) {
		c.JSON(http.StatusNotFound, gin.H{"error": "scan not running"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Stream — SSE GET /api/kavach/scans/:id/live
func (h *KavachHandler) Stream(c *gin.Context) {
	id := c.Param("id")
	scan, ok := h.Mgr.Get(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "scan not running or already finished"})
		return
	}
	team := middleware.TeamID(c)
	if team != "" && scan.TeamID != "" && scan.TeamID != team {
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

	sub := scan.Subscribe()
	defer scan.Unsubscribe(sub)

	keepalive := time.NewTicker(15 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case ev, ok := <-*sub:
			if !ok {
				return
			}
			writeKavachEvent(c.Writer, flusher, ev.Kind, ev)
		case <-keepalive.C:
			_, _ = io.WriteString(c.Writer, ": ping\n\n")
			flusher.Flush()
		}
	}
}

func writeKavachEvent(w io.Writer, f http.Flusher, event string, data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		return
	}
	_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload)
	f.Flush()
}

// ─── Jira flows ─────────────────────────────────────────────────────────
// Two distinct flows, deliberately different from APIStress's single
// "attach to existing ticket" flow:
//
//   POST /api/kavach/findings/:id/file-jira  → CREATES a NEW Jira issue
//                                              per finding (severity-mapped
//                                              priority + evidence body).
//   POST /api/kavach/scans/:id/attach-jira   → Attaches the full PDF
//                                              report to an existing
//                                              tracking ticket (analogous
//                                              to APIStress's flow).
//   GET  /api/kavach/scans/:id/jira-links    → Paper trail of both flows.

type fileFindingBody struct {
	ProjectKey string   `json:"project_key"`
	IssueType  string   `json:"issue_type"`
	Summary    string   `json:"summary"`  // optional override
	Comment    string   `json:"comment"`  // optional body override
	Priority   string   `json:"priority"` // optional override
	Labels     []string `json:"labels"`
}

// FileFinding creates a NEW Jira issue from a single finding.
func (h *KavachHandler) FileFinding(c *gin.Context) {
	if h.Jira == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Jira integration is not configured (set CH_JIRA_* env vars)"})
		return
	}
	team := middleware.TeamID(c)
	id := c.Param("id")

	var body fileFindingBody
	_ = c.ShouldBindJSON(&body)

	// Load the finding (team-scoped).
	row := h.DB.QueryRow(c.Request.Context(),
		`SELECT f.id, f.scan_id, f.severity, f.category, f.test_id, f.title, f.description,
		        f.plain_title, f.plain_whats_happening, f.plain_why, f.plain_how_to_fix, f.effort,
		        f.request_snapshot, f.response_snapshot, f.evidence_text,
		        f.owasp, f.cwe, f.remediation, s.target_url, s.target_host
		   FROM vapt_findings f JOIN vapt_scans s ON s.id = f.scan_id
		  WHERE f.id = $1 AND f.team_id = $2`, id, team)
	var fid int64
	var scanID, sev, cat, tid, title, desc, ptitle, pwhat, pwhy, effort, owasp, cwe, remed, ev, targetURL, targetHost string
	var howRaw, reqJ, respJ []byte
	if err := row.Scan(&fid, &scanID, &sev, &cat, &tid, &title, &desc,
		&ptitle, &pwhat, &pwhy, &howRaw, &effort,
		&reqJ, &respJ, &ev, &owasp, &cwe, &remed, &targetURL, &targetHost); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "finding not found"})
		return
	}
	var howSteps []string
	_ = json.Unmarshal(howRaw, &howSteps)

	projectKey := strings.TrimSpace(strings.ToUpper(body.ProjectKey))
	if projectKey == "" {
		projectKey = strings.TrimSpace(strings.ToUpper(h.Jira.ProjectKey))
	}
	if projectKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "project_key required (or set CH_JIRA_PROJECT_KEY on the server)"})
		return
	}
	issueType := body.IssueType
	if issueType == "" {
		issueType = "Bug"
	}
	summary := body.Summary
	if strings.TrimSpace(summary) == "" {
		// Plain title leads — readable for non-security folks.
		head := ptitle
		if head == "" {
			head = title
		}
		summary = "[Kavach] " + strings.Title(sev) + " — " + head
	}
	comment := body.Comment
	if strings.TrimSpace(comment) == "" {
		comment = BuildKavachFindingIssueBody(KavachFindingForBody{
			TestID: tid, Severity: sev, Title: head(ptitle, title),
			PlainWhatsHappening: pwhat, PlainWhy: pwhy, PlainHowToFix: howSteps,
			OWASP: owasp, CWE: cwe, Effort: effort,
			Description: desc, Remediation: remed,
			Evidence:  ev,
			TargetURL: targetURL, TargetHost: targetHost,
		})
	}
	priority := body.Priority
	if priority == "" {
		priority = severityToJiraPriority(sev)
	}
	labels := body.Labels
	if len(labels) == 0 {
		labels = severityToLabels(sev, cwe, owasp)
	}

	created, err := h.Jira.CreateIssue(c.Request.Context(), projectKey, issueType, summary, comment, priority, labels)
	if err != nil {
		logger.Warn("kavach jira create failed", zap.String("finding_id", id), zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": "Jira create failed: " + err.Error()})
		return
	}

	// Persist link.
	var teamArg interface{}
	if team != "" {
		teamArg = team
	}
	createdBy := middleware.TeamName(c)
	if _, err := h.DB.Exec(c.Request.Context(),
		`INSERT INTO vapt_jira_links (scan_id, finding_id, team_id, kind, jira_id, jira_url, actor)
		 VALUES ($1, $2, $3, 'issue_created', $4, $5, $6)`,
		scanID, fid, teamArg, created.Key, created.URL, createdBy); err != nil {
		logger.Warn("vapt_jira_links insert failed", zap.Error(err))
	}
	if h.Activity != nil {
		h.Activity.Log(c.Request.Context(), activity.Event{
			TeamID:       team,
			ActorType:    "user",
			ActorName:    createdBy,
			EventType:    "feature.kavach.finding.filed",
			ToolSlug:     "kavach",
			ResourceType: "finding",
			ResourceID:   id,
			Meta: map[string]interface{}{
				"jira_id":  created.Key,
				"severity": sev,
				"test_id":  tid,
				"scan_id":  scanID,
			},
			IP: c.ClientIP(), UA: c.GetHeader("User-Agent"),
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"ok":       true,
		"jira_id":  created.Key,
		"jira_url": created.URL,
	})
}

type attachReportBody struct {
	JiraID  string `json:"jira_id"`
	Comment string `json:"comment"`
}

// AttachReport — POST /api/kavach/scans/:id/attach-jira
// Re-renders the PDF, attaches it to an existing issue, posts a summary
// comment.
func (h *KavachHandler) AttachReport(c *gin.Context) {
	if h.Jira == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Jira integration is not configured"})
		return
	}
	team := middleware.TeamID(c)
	id := c.Param("id")

	var body attachReportBody
	_ = c.ShouldBindJSON(&body)
	jiraID := strings.TrimSpace(strings.ToUpper(body.JiraID))
	if jiraID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "jira_id is required"})
		return
	}

	// Verify the scan belongs to this team + collect summary for the comment.
	row := h.DB.QueryRow(c.Request.Context(),
		`SELECT id, target_url, target_host, status, summary, created_by
		   FROM vapt_scans WHERE id = $1 AND team_id = $2`, id, team)
	var sid, tURL, tHost, status, createdBy string
	var summaryRaw []byte
	if err := row.Scan(&sid, &tURL, &tHost, &status, &summaryRaw, &createdBy); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "scan not found"})
		return
	}
	var summary map[string]interface{}
	_ = json.Unmarshal(summaryRaw, &summary)

	// Verify the issue exists + grab assignee for tagging.
	issue, err := h.Jira.GetIssue(c.Request.Context(), jiraID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Jira lookup failed: " + err.Error()})
		return
	}

	// Render PDF.
	pdf, err := renderKavachPDFForScan(c.Request.Context(), h.DB, team, sid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "render PDF: " + err.Error()})
		return
	}
	filename := "kavach-" + safeFilename(tHost) + "-" + sid[:8] + ".pdf"
	if err := h.Jira.Attach(c.Request.Context(), jiraID, filename, pdf, "application/pdf"); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Jira attach failed: " + err.Error()})
		return
	}

	jiraURL := h.Jira.BaseURL + "/browse/" + jiraID
	commentBody := body.Comment
	if commentBody == "" {
		commentBody = BuildKavachScanComment(tHost, tURL, status, createdBy, summary, issue, jiraURL, filename)
	} else if issue.AssigneeMention != "" && !strings.Contains(commentBody, issue.AssigneeMention) {
		commentBody = issue.AssigneeMention + "\n\n" + commentBody
	}
	if err := h.Jira.Comment(c.Request.Context(), jiraID, commentBody); err != nil {
		logger.Warn("kavach jira comment failed (attach succeeded)",
			zap.String("issue", jiraID), zap.Error(err))
	}

	var teamArg interface{}
	if team != "" {
		teamArg = team
	}
	if _, err := h.DB.Exec(c.Request.Context(),
		`INSERT INTO vapt_jira_links (scan_id, team_id, kind, jira_id, jira_url, filename, bytes, actor)
		 VALUES ($1, $2, 'report_attached', $3, $4, $5, $6, $7)`,
		sid, teamArg, jiraID, jiraURL, filename, len(pdf), createdBy); err != nil {
		logger.Warn("vapt_jira_links insert failed", zap.Error(err))
	}
	if h.Activity != nil {
		h.Activity.Log(c.Request.Context(), activity.Event{
			TeamID: team, ActorType: "user", ActorName: createdBy,
			EventType: "feature.kavach.report.attached", ToolSlug: "kavach",
			ResourceType: "scan", ResourceID: sid,
			Meta: map[string]interface{}{
				"jira_id": jiraID, "filename": filename, "bytes": len(pdf),
			},
			IP: c.ClientIP(), UA: c.GetHeader("User-Agent"),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"ok": true, "jira_id": jiraID, "jira_url": jiraURL, "filename": filename,
	})
}

// ListJiraLinks — paper trail per scan.
func (h *KavachHandler) ListJiraLinks(c *gin.Context) {
	team := middleware.TeamID(c)
	id := c.Param("id")
	// Verify ownership.
	var owns int
	if err := h.DB.QueryRow(c.Request.Context(),
		`SELECT 1 FROM vapt_scans WHERE id = $1 AND team_id = $2`, id, team).Scan(&owns); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "scan not found"})
		return
	}
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, finding_id, kind, jira_id, jira_url, filename, bytes, actor, created_at
		   FROM vapt_jira_links WHERE scan_id = $1 ORDER BY created_at DESC`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := []gin.H{}
	for rows.Next() {
		var lid int64
		var findingID *int64
		var kind, jid, jurl, fn, actor string
		var bytes int
		var fnPtr *string
		var ts time.Time
		if err := rows.Scan(&lid, &findingID, &kind, &jid, &jurl, &fnPtr, &bytes, &actor, &ts); err != nil {
			continue
		}
		if fnPtr != nil {
			fn = *fnPtr
		}
		out = append(out, gin.H{
			"id": lid, "finding_id": findingID, "kind": kind,
			"jira_id": jid, "jira_url": jurl, "filename": fn, "bytes": bytes,
			"actor": actor, "created_at": ts.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, out)
}

// PDF — GET /api/kavach/scans/:id/pdf
func (h *KavachHandler) PDF(c *gin.Context) {
	team := middleware.TeamID(c)
	id := c.Param("id")
	pdf, err := renderKavachPDFForScan(c.Request.Context(), h.DB, team, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", `attachment; filename="kavach-`+id[:8]+`.pdf"`)
	c.Data(http.StatusOK, "application/pdf", pdf)
}

// ─── Helpers — issue body, scan summary comment, severity mappings ──────

type KavachFindingForBody struct {
	TestID, Severity, Title, OWASP, CWE, Effort string
	PlainWhatsHappening, PlainWhy               string
	PlainHowToFix                               []string
	Description, Remediation, Evidence          string
	TargetURL, TargetHost                       string
}

// BuildKavachFindingIssueBody — wiki-text body for a NEW Jira issue
// created from a single Kavach finding. Leads with the plain-English block
// so a developer reads "what to do" first; technical reference at the end.
func BuildKavachFindingIssueBody(f KavachFindingForBody) string {
	var b strings.Builder
	// Severity panel — colour-coded.
	panelColor := "#FFEBE6"
	tone := "🛡️"
	switch f.Severity {
	case "critical":
		panelColor = "#FFEBE6"
		tone = "🚨 Fix this now"
	case "high":
		panelColor = "#FFFAE6"
		tone = "⚠️ Fix this week"
	case "medium":
		panelColor = "#FFFAE6"
		tone = "🟡 Fix when you can"
	case "low":
		panelColor = "#DEEBFF"
		tone = "🔵 Nice to have"
	case "info":
		panelColor = "#F4F5F7"
		tone = "ℹ️ Heads-up"
	}
	b.WriteString("{panel:bgColor=" + panelColor + "}*" + tone + "* — _" + strings.ToUpper(f.Severity) + "_{panel}\n\n")

	b.WriteString("h2. " + f.Title + "\n\n")

	if f.PlainWhatsHappening != "" {
		b.WriteString("h3. What's happening\n")
		b.WriteString(f.PlainWhatsHappening + "\n\n")
	}
	if f.PlainWhy != "" {
		b.WriteString("h3. Why it matters\n")
		b.WriteString(f.PlainWhy + "\n\n")
	}
	if len(f.PlainHowToFix) > 0 {
		b.WriteString("h3. How to fix it\n")
		for _, s := range f.PlainHowToFix {
			b.WriteString("# " + s + "\n")
		}
		b.WriteString("\n")
	}
	if f.Effort != "" {
		b.WriteString("_Estimated effort:_ *" + f.Effort + "*\n\n")
	}

	b.WriteString("----\n")
	b.WriteString("h3. Evidence\n")
	if f.Evidence != "" {
		b.WriteString("{code}\n" + f.Evidence + "\n{code}\n\n")
	}
	if f.TargetURL != "" {
		b.WriteString("*Target:* " + f.TargetURL + "\n")
	}
	if f.TargetHost != "" {
		b.WriteString("*Host:* " + f.TargetHost + "\n\n")
	}

	b.WriteString("h3. Technical reference\n")
	b.WriteString("|| Field || Value ||\n")
	b.WriteString("| Test | {{" + f.TestID + "}} |\n")
	b.WriteString("| OWASP | " + valOrDash(f.OWASP) + " |\n")
	b.WriteString("| CWE | " + valOrDash(f.CWE) + " |\n")

	if f.Description != "" {
		b.WriteString("\nh4. Technical description\n")
		b.WriteString(f.Description + "\n")
	}
	if f.Remediation != "" {
		b.WriteString("\nh4. Remediation guidance\n")
		b.WriteString(f.Remediation + "\n")
	}

	b.WriteString("\n----\n")
	b.WriteString("_Filed automatically by *Choice Techlab Kavach* — API security shield._")
	return b.String()
}

// BuildKavachScanComment — wiki-text comment posted on the existing Jira
// issue when the operator attaches the full PDF report.
func BuildKavachScanComment(host, url, status, by string, summary map[string]interface{}, issue *jira.IssueInfo, jiraURL, filename string) string {
	var b strings.Builder
	if issue != nil && issue.AssigneeMention != "" {
		b.WriteString(issue.AssigneeMention + " — please review the attached Kavach security report when you have a moment.\n\n")
	} else {
		b.WriteString("Kavach security report attached.\n\n")
	}
	b.WriteString("h3. 🛡️ Kavach — security scan summary\n\n")
	if filename != "" {
		b.WriteString("📎 *Attachment:* {{" + filename + "}}\n\n")
	}
	b.WriteString("|| Field || Value ||\n")
	b.WriteString("| *Target* | " + valOrDash(host) + " |\n")
	b.WriteString("| *URL*    | " + valOrDash(url) + " |\n")
	b.WriteString("| *Status* | " + valOrDash(status) + " |\n")
	b.WriteString("| *Operator* | " + valOrDash(by) + " |\n")

	counts, _ := summary["counts"].(map[string]interface{})
	if counts != nil {
		b.WriteString("\nh4. Findings by severity\n\n")
		b.WriteString("|| Severity || Count ||\n")
		for _, k := range []string{"critical", "high", "medium", "low", "info"} {
			n := 0
			if v, ok := counts[k].(float64); ok {
				n = int(v)
			}
			label := map[string]string{
				"critical": "🚨 Fix this now (Critical)",
				"high":     "⚠️ Fix this week (High)",
				"medium":   "🟡 Fix when you can (Medium)",
				"low":      "🔵 Nice to have (Low)",
				"info":     "ℹ️ Heads-up (Info)",
			}[k]
			b.WriteString("| " + label + " | " + intToA(n) + " |\n")
		}
	}
	if total, ok := summary["total_findings"].(float64); ok {
		b.WriteString("\n*Total findings:* " + intToA(int(total)) + "\n")
	}

	b.WriteString("\nh4. Next steps\n")
	b.WriteString("- Open the attached PDF for the full per-finding breakdown with reproducer requests + remediation steps in plain English.\n")
	b.WriteString("- Critical / High findings should be addressed before the next deploy of this surface.\n")

	b.WriteString("\n----\n")
	b.WriteString("_Posted automatically by *Choice Techlab Kavach*. Reply to this comment if anything looks wrong._")
	return b.String()
}

// severityToJiraPriority maps Kavach severities to Jira's stock priority names.
func severityToJiraPriority(sev string) string {
	switch strings.ToLower(sev) {
	case "critical":
		return "Highest"
	case "high":
		return "High"
	case "medium":
		return "Medium"
	case "low":
		return "Low"
	case "info":
		return "Lowest"
	}
	return ""
}

// severityToLabels generates the Jira labels we attach to every filed finding.
func severityToLabels(sev, cwe, owasp string) []string {
	labels := []string{"security", "kavach", "vapt", "sev-" + strings.ToLower(sev)}
	if cwe != "" {
		labels = append(labels, "cwe-"+strings.ToLower(strings.TrimPrefix(cwe, "CWE-")))
	}
	if owasp != "" {
		// OWASP API1:2023 → owasp-api1
		key := strings.ToLower(strings.SplitN(owasp, ":", 2)[0])
		labels = append(labels, "owasp-"+key)
	}
	return labels
}

func valOrDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "—"
	}
	return s
}

func head(plain, fallback string) string {
	if strings.TrimSpace(plain) != "" {
		return plain
	}
	return fallback
}

// Tiny int → ASCII; avoids strconv just for two call sites.
func intToA(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	d := []byte{}
	for n > 0 {
		d = append([]byte{byte('0' + n%10)}, d...)
		n /= 10
	}
	if neg {
		d = append([]byte{'-'}, d...)
	}
	return string(d)
}

func safeFilename(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z',
			c >= 'A' && c <= 'Z',
			c >= '0' && c <= '9',
			c == '-' || c == '_' || c == '.':
			out = append(out, c)
		default:
			out = append(out, '_')
		}
	}
	if len(out) == 0 {
		return "scan"
	}
	return string(out)
}

// renderKavachPDFForScan loads the scan + findings + delegates to the PDF
// renderer in the kavach package. Defined here (handler-side) because it
// needs to peek at the DB.
func renderKavachPDFForScan(ctx context.Context, db *pgxpool.Pool, teamID, scanID string) ([]byte, error) {
	var (
		sid, url, host, status, createdBy string
		startedAt                         time.Time
		finishedAt                        *time.Time
		summaryRaw                        []byte
	)
	if err := db.QueryRow(ctx, `
		SELECT id, target_url, target_host, status, started_at, finished_at, summary, created_by
		  FROM vapt_scans WHERE id = $1 AND team_id = $2`, scanID, teamID,
	).Scan(&sid, &url, &host, &status, &startedAt, &finishedAt, &summaryRaw, &createdBy); err != nil {
		return nil, fmt.Errorf("scan not found")
	}
	rows, err := db.Query(ctx, `
		SELECT severity, category, test_id, title, description,
		       plain_title, plain_whats_happening, plain_why, plain_how_to_fix, effort,
		       evidence_text, owasp, cwe, remediation, test_explanation
		  FROM vapt_findings WHERE scan_id = $1 AND team_id = $2
		 ORDER BY
		   CASE severity
		     WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3
		     WHEN 'low' THEN 2 WHEN 'info' THEN 1 ELSE 0 END DESC`, scanID, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	findings := []kavach.PDFFinding{}
	for rows.Next() {
		var sev, cat, tid, title, desc, ptitle, pwhat, pwhy, effort, ev, owasp, cwe, remed, testExp string
		var howRaw []byte
		if err := rows.Scan(&sev, &cat, &tid, &title, &desc, &ptitle, &pwhat, &pwhy, &howRaw, &effort, &ev, &owasp, &cwe, &remed, &testExp); err != nil {
			continue
		}
		var howSteps []string
		_ = json.Unmarshal(howRaw, &howSteps)
		findings = append(findings, kavach.PDFFinding{
			Severity: sev, Category: cat, TestID: tid,
			Title: title, Description: desc,
			PlainTitle: ptitle, PlainWhatsHappening: pwhat, PlainWhy: pwhy,
			PlainHowToFix: howSteps, Effort: effort,
			Evidence: ev, OWASP: owasp, CWE: cwe, Remediation: remed,
			TestExplanation: testExp,
		})
	}
	var summary map[string]interface{}
	_ = json.Unmarshal(summaryRaw, &summary)

	// Lift the per-test pass/fail rows out of the summary so the PDF can
	// render the VAPT compliance section. summary["test_results"] is a
	// JSON-decoded []interface{}; we coerce into typed PDFTestRows here.
	testRows := []kavach.PDFTestRow{}
	if rawRows, ok := summary["test_results"].([]interface{}); ok {
		for _, r := range rawRows {
			m, ok := r.(map[string]interface{})
			if !ok {
				continue
			}
			row := kavach.PDFTestRow{}
			if v, ok := m["test_id"].(string); ok {
				row.TestID = v
			}
			if v, ok := m["name"].(string); ok {
				row.Name = v
			}
			if v, ok := m["category"].(string); ok {
				row.Category = v
			}
			if v, ok := m["passed"].(bool); ok {
				row.Passed = v
			}
			if v, ok := m["finding_count"].(float64); ok {
				row.FindingCount = int(v)
			}
			if row.Name == "" {
				row.Name = row.TestID
			}
			testRows = append(testRows, row)
		}
	}

	return kavach.RenderSecurityPDF(kavach.PDFInput{
		ScanID: sid, TargetURL: url, TargetHost: host, Status: status,
		StartedAt: startedAt, FinishedAt: finishedAt,
		CreatedBy: createdBy, Summary: summary, Findings: findings,
		TestRows: testRows,
	})
}
