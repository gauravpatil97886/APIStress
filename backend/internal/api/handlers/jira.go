package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/choicetechlab/choicehammer/internal/activity"
	"github.com/choicetechlab/choicehammer/internal/api/middleware"
	"github.com/choicetechlab/choicehammer/internal/engine"
	"github.com/choicetechlab/choicehammer/internal/jira"
	"github.com/choicetechlab/choicehammer/internal/logger"
	"github.com/choicetechlab/choicehammer/internal/metrics"
	"github.com/choicetechlab/choicehammer/internal/report"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type JiraHandler struct {
	DB       *pgxpool.Pool
	Client   *jira.Client      // nil when CH_JIRA_* env not configured
	Activity *activity.Service
}

// Health — public-ish (still behind team auth) endpoint for the frontend to
// know whether to show the "Attach to Jira" button. We don't expose the
// credentials themselves, just whether they're set + which auth mode is in
// use + a probe result.
func (h *JiraHandler) Health(c *gin.Context) {
	if h.Client == nil {
		c.JSON(http.StatusOK, gin.H{"configured": false})
		return
	}
	out := gin.H{
		"configured": true,
		"base_url":   h.Client.BaseURL,
		"auth_kind":  h.Client.AuthKind,
		"project":    h.Client.ProjectKey,
	}
	// Probe is best-effort — don't fail the endpoint just because Jira
	// happens to be slow right now.
	if me, err := h.Client.Health(c.Request.Context()); err == nil {
		out["ok"] = true
		if name, _ := me["displayName"].(string); name != "" {
			out["account"] = name
		}
		if email, _ := me["emailAddress"].(string); email != "" {
			out["email"] = email
		}
		if id, _ := me["accountId"].(string); id != "" {
			out["account_id"] = id
		}
		// Pick the largest avatar Atlassian offered.
		if avatars, ok := me["avatarUrls"].(map[string]interface{}); ok {
			for _, sz := range []string{"48x48", "32x32", "24x24", "16x16"} {
				if u, _ := avatars[sz].(string); u != "" {
					out["avatar"] = u
					break
				}
			}
		}
		if tz, _ := me["timeZone"].(string); tz != "" {
			out["timezone"] = tz
		}
		if locale, _ := me["locale"].(string); locale != "" {
			out["locale"] = locale
		}
		if active, ok := me["active"].(bool); ok {
			out["active"] = active
		}
	} else {
		out["ok"] = false
		out["error"] = err.Error()
	}
	c.JSON(http.StatusOK, out)
}

// AttachRun — POST /api/runs/:id/attach-jira
// Body: { "jira_id": "CT-123" }   — optional; falls back to the run's stored jira_id
//
// Generates the run's PDF report, attaches it to the issue, posts a short
// summary comment with a permalink back into the platform.
func (h *JiraHandler) AttachRun(c *gin.Context) {
	if h.Client == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Jira integration is not configured (set CH_JIRA_* env vars)"})
		return
	}
	team := middleware.TeamID(c)
	id := c.Param("id")

	row := h.DB.QueryRow(c.Request.Context(),
		`SELECT id, name, status, started_at, finished_at, summary, config,
		        created_by, jira_id, jira_link, notes, env_tag, cost_inputs
		   FROM runs WHERE id=$1 AND team_id=$2`, id, team)
	var rid, name, status, createdBy, dbJiraID, jiraLink, notes, envTag string
	var started, finished *time.Time
	var summaryRaw, cfgRaw, costRaw []byte
	if err := row.Scan(&rid, &name, &status, &started, &finished, &summaryRaw, &cfgRaw,
		&createdBy, &dbJiraID, &jiraLink, &notes, &envTag, &costRaw); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not found"})
		return
	}

	var body struct {
		JiraID  string `json:"jira_id"`
		Comment string `json:"comment"` // optional override of the auto-summary
	}
	_ = c.ShouldBindJSON(&body)
	jiraID := strings.TrimSpace(body.JiraID)
	if jiraID == "" {
		jiraID = strings.TrimSpace(dbJiraID)
	}
	if jiraID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no Jira ID on this run — supply one in the request body"})
		return
	}

	// Pull issue info up front so we can (a) fail fast on bad keys, and
	// (b) tag the assignee in the comment.
	issue, err := h.Client.GetIssue(c.Request.Context(), jiraID)
	if err != nil {
		if strings.HasPrefix(err.Error(), "404:") {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Jira issue %s not found (or your service account can't see it)", jiraID)})
		} else {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Jira lookup failed: " + err.Error()})
		}
		return
	}

	// Decode config + summary so we can render the full PDF.
	var cfg engine.TestConfig
	_ = json.Unmarshal(cfgRaw, &cfg)
	var summary *engine.Summary
	if len(summaryRaw) > 0 {
		var s engine.Summary
		if json.Unmarshal(summaryRaw, &s) == nil {
			summary = &s
		}
	}
	var series []metrics.SecondBucket
	if summary != nil {
		series = summary.Series
	}

	pdf, err := report.RenderPDFFromDataWithOptions(report.ReportData{
		ID: rid, Name: name, Status: status, Config: cfg,
		Summary: summary, StartedAt: started, FinishedAt: finished,
		CreatedBy: createdBy, JiraID: jiraID, JiraLink: jiraLink,
		Notes: notes, EnvTag: envTag, Series: series,
	}, report.PDFOptions{Orientation: "portrait", IncludeCharts: true})
	if err != nil {
		logger.Error("jira attach: pdf render failed", zap.String("run_id", rid), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to render PDF: " + err.Error()})
		return
	}

	jiraURL := h.Client.BaseURL + "/browse/" + jiraID
	filename := fmt.Sprintf("apistress-%s-%s.pdf", strings.ReplaceAll(name, " ", "_"), rid[:8])
	if err := h.Client.Attach(c.Request.Context(), jiraID, filename, pdf, "application/pdf"); err != nil {
		logger.Warn("jira attach failed", zap.String("issue", jiraID), zap.String("run_id", rid), zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": "Jira attach failed: " + err.Error()})
		return
	}

	commentBody := body.Comment
	if commentBody == "" {
		commentBody = BuildJiraSummaryComment(name, status, createdBy, envTag, summary, issue, jiraURL, filename)
	} else if issue.AssigneeMention != "" && !strings.Contains(commentBody, issue.AssigneeMention) {
		// Caller supplied a custom comment but didn't tag the assignee —
		// prepend the mention so the right person gets pinged.
		commentBody = issue.AssigneeMention + "\n\n" + commentBody
	}
	if err := h.Client.Comment(c.Request.Context(), jiraID, commentBody); err != nil {
		// Don't fail the whole request if the comment fails — the attach
		// already succeeded and that's the bulk of what the user wanted.
		logger.Warn("jira comment failed (attach succeeded)", zap.String("issue", jiraID), zap.Error(err))
	}

	// Persist a record of the attach so the report page can show "this run
	// was sent to CT-123 on <date>" after the user navigates away & back.
	var teamArg interface{}
	if team != "" {
		teamArg = team
	}
	if _, err := h.DB.Exec(c.Request.Context(),
		`INSERT INTO jira_attachments (run_id, team_id, jira_id, jira_url, filename, bytes, attached_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		rid, teamArg, jiraID, jiraURL, filename, len(pdf), createdBy,
	); err != nil {
		logger.Warn("jira_attachments insert failed", zap.String("run_id", rid), zap.Error(err))
	}

	if h.Activity != nil {
		h.Activity.Log(c.Request.Context(), activity.Event{
			TeamID:       team,
			ActorType:    "user",
			ActorName:    createdBy,
			EventType:    "feature.jira.attach",
			ToolSlug:     "apistress",
			ResourceType: "run",
			ResourceID:   rid,
			Meta: map[string]interface{}{
				"jira_id":  jiraID,
				"filename": filename,
				"bytes":    len(pdf),
			},
			IP: c.ClientIP(),
			UA: c.GetHeader("User-Agent"),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":       true,
		"jira_id":  jiraID,
		"jira_url": jiraURL,
		"filename": filename,
	})
}

// LookupIssue — GET /api/jira/issue/:key
// Lightweight fetch used by the test builder to live-preview the issue
// (summary, status, priority, assignee with avatar) as the user types/pastes
// the Jira ID. We never expose the raw token, only what's safe to display.
// Validates the key shape on the server too so we don't waste a round-trip
// to Jira on garbage input.
var jiraKeyRE = regexp.MustCompile(`^[A-Z][A-Z0-9_]+-\d+$`)

func (h *JiraHandler) LookupIssue(c *gin.Context) {
	if h.Client == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Jira integration is not configured"})
		return
	}
	key := strings.ToUpper(strings.TrimSpace(c.Param("key")))
	if !jiraKeyRE.MatchString(key) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "expected key like PROJ-123"})
		return
	}
	if err := h.Client.ValidateProject(key); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	info, err := h.Client.GetIssue(c.Request.Context(), key)
	if err != nil {
		if strings.HasPrefix(err.Error(), "404:") {
			c.JSON(http.StatusNotFound, gin.H{"error": "issue not found"})
		} else {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, info)
}

// ListAttachments — GET /api/runs/:id/jira-attachments
// Shows the trail of every time this run's report was sent to Jira.
func (h *JiraHandler) ListAttachments(c *gin.Context) {
	team := middleware.TeamID(c)
	id := c.Param("id")
	// Verify the run is the caller's, then list attachments.
	var owns int
	if err := h.DB.QueryRow(c.Request.Context(),
		`SELECT 1 FROM runs WHERE id=$1 AND team_id=$2`, id, team).Scan(&owns); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not found"})
		return
	}
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, jira_id, jira_url, filename, bytes, attached_by, attached_at
		   FROM jira_attachments WHERE run_id=$1 ORDER BY attached_at DESC`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := []gin.H{}
	for rows.Next() {
		var aid int64
		var ji, ju, fn, ab string
		var bytes int
		var at time.Time
		if err := rows.Scan(&aid, &ji, &ju, &fn, &bytes, &ab, &at); err != nil {
			continue
		}
		out = append(out, gin.H{
			"id": aid, "jira_id": ji, "jira_url": ju, "filename": fn,
			"bytes": bytes, "attached_by": ab, "attached_at": at.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, out)
}

// BuildJiraSummaryComment renders a professional, Jira-wiki-formatted comment
// summarising the load run. The assignee (if any) is mentioned at the top
// so they get a notification, and a Jira-style table presents the headline
// numbers at a glance. Exported so the auto-attach finish hook in
// cmd/server/main.go can reuse it.
func BuildJiraSummaryComment(name, status, createdBy, envTag string, s *engine.Summary, issue *jira.IssueInfo, jiraURL, filename string) string {
	var b strings.Builder

	if issue != nil && issue.AssigneeMention != "" {
		b.WriteString(issue.AssigneeMention)
		b.WriteString(" — please review the attached load-test report when you have a moment.\n\n")
	} else {
		b.WriteString("Load-test report attached for review.\n\n")
	}

	b.WriteString("h3. 📎 APIStress — load-test report\n\n")

	if filename != "" {
		b.WriteString(fmt.Sprintf("📄 *Attachment:* {{%s}}\n\n", filename))
	}

	// Headline metadata table — Jira wiki markup renders this as an actual
	// two-column table with bold header cells.
	b.WriteString("|| Field || Value ||\n")
	b.WriteString(fmt.Sprintf("| *Test* | %s |\n", escapeJiraCell(name)))
	b.WriteString(fmt.Sprintf("| *Status* | %s %s |\n", statusEmoji(status), status))
	if createdBy != "" {
		b.WriteString(fmt.Sprintf("| *Operator* | %s |\n", escapeJiraCell(createdBy)))
	}
	if envTag != "" {
		b.WriteString(fmt.Sprintf("| *Environment* | %s |\n", envTag))
	}
	b.WriteString(fmt.Sprintf("| *Run timestamp* | %s |\n", time.Now().Format(time.RFC1123)))

	if s != nil {
		b.WriteString("\nh4. Headline metrics\n\n")
		b.WriteString("|| Metric || Value ||\n")
		b.WriteString(fmt.Sprintf("| Total requests | %d |\n", s.Totals.Requests))
		b.WriteString(fmt.Sprintf("| Errors | %d  _(%.2f%% error rate)_ |\n",
			s.Totals.Errors, s.ErrorRate*100))
		b.WriteString(fmt.Sprintf("| Throughput | %.0f rps  _(avg)_ |\n", s.RPS))
		b.WriteString(fmt.Sprintf("| Duration | %.0fs |\n", s.DurationS))

		// Add a one-line health verdict so the reader can act without opening the PDF.
		b.WriteString("\nh4. Verdict\n")
		b.WriteString(verdictLine(s))
		b.WriteString("\n")
	}

	b.WriteString("\nh4. Next steps\n")
	b.WriteString("- Open the attached PDF for the full request/latency breakdown, percentile charts, and per-second timeline.\n")
	b.WriteString("- If results look off, re-run from APIStress and a fresh report will replace this attachment.\n")
	if jiraURL != "" {
		// Self-referencing link is harmless and gives the issue a permalink in
		// the activity feed.
		b.WriteString(fmt.Sprintf("- This issue: %s\n", jiraURL))
	}

	b.WriteString("\n----\n")
	b.WriteString("_Posted automatically by *Choice Techlab APIStress*. Reply to this comment if anything looks wrong._")

	return b.String()
}

// statusEmoji maps an engine RunStatus to a single icon for the wiki table.
func statusEmoji(s string) string {
	switch strings.ToLower(s) {
	case "completed", "finished", "passed", "ok":
		return "✅"
	case "running":
		return "⏳"
	case "stopped", "cancelled", "canceled":
		return "🛑"
	case "failed", "errored", "error":
		return "❌"
	default:
		return "ℹ️"
	}
}

// verdictLine returns a one-paragraph plain-English read of the run.
func verdictLine(s *engine.Summary) string {
	er := s.ErrorRate * 100
	switch {
	case s.Totals.Requests == 0:
		return "_No requests were recorded — the run completed without traffic._"
	case er == 0:
		return fmt.Sprintf("✅ Clean run — *%.0f rps* sustained over %.0fs with zero errors across %d requests.",
			s.RPS, s.DurationS, s.Totals.Requests)
	case er < 1:
		return fmt.Sprintf("🟢 Healthy — *%.2f%%* error rate (%d / %d) at %.0f rps. No regression alarms.",
			er, s.Totals.Errors, s.Totals.Requests, s.RPS)
	case er < 5:
		return fmt.Sprintf("🟡 Mixed — *%.2f%%* error rate (%d / %d). Worth a look at the failure breakdown in the PDF.",
			er, s.Totals.Errors, s.Totals.Requests)
	default:
		return fmt.Sprintf("🔴 Failing — *%.2f%%* error rate (%d / %d). The target is dropping a meaningful share of requests under this load.",
			er, s.Totals.Errors, s.Totals.Requests)
	}
}

// escapeJiraCell strips characters that would break a wiki-markup table row.
func escapeJiraCell(s string) string {
	s = strings.ReplaceAll(s, "|", "\\|")
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", " ")
	return s
}
