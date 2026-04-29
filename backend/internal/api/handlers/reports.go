package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/choicetechlab/choicehammer/internal/cost"
	"github.com/choicetechlab/choicehammer/internal/engine"
	"github.com/choicetechlab/choicehammer/internal/logger"
	"github.com/choicetechlab/choicehammer/internal/metrics"
	"github.com/choicetechlab/choicehammer/internal/report"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type ReportsHandler struct {
	DB *pgxpool.Pool
}

type runRow struct {
	ID         string             `json:"id"`
	Name       string             `json:"name"`
	Status     string             `json:"status"`
	Config     engine.TestConfig  `json:"config"`
	Summary    *engine.Summary    `json:"summary"`
	StartedAt  *time.Time         `json:"started_at"`
	FinishedAt *time.Time         `json:"finished_at"`
	CreatedBy  string             `json:"created_by"`
	JiraID     string             `json:"jira_id"`
	JiraLink   string             `json:"jira_link"`
	Notes      string             `json:"notes"`
	EnvTag     string             `json:"env_tag"`
	CostInputs cost.Inputs        `json:"cost_inputs"`
	Series     []metrics.SecondBucket `json:"series"`
}

func (h *ReportsHandler) loadRow(c *gin.Context, id string) (*runRow, error) {
	row := h.DB.QueryRow(c.Request.Context(),
		`SELECT id, name, status, started_at, finished_at, summary, config,
		        created_by, jira_id, jira_link, notes, env_tag, cost_inputs
		   FROM runs WHERE id=$1`, id)
	var r runRow
	var started, finished *time.Time
	var summaryRaw, cfgRaw, costRaw []byte
	if err := row.Scan(&r.ID, &r.Name, &r.Status, &started, &finished, &summaryRaw, &cfgRaw,
		&r.CreatedBy, &r.JiraID, &r.JiraLink, &r.Notes, &r.EnvTag, &costRaw); err != nil {
		return nil, err
	}
	r.StartedAt = started
	r.FinishedAt = finished
	if len(summaryRaw) > 0 {
		var s engine.Summary
		if err := json.Unmarshal(summaryRaw, &s); err == nil {
			r.Summary = &s
			r.Series = s.Series
		}
	}
	_ = json.Unmarshal(cfgRaw, &r.Config)
	if len(costRaw) > 0 {
		_ = json.Unmarshal(costRaw, &r.CostInputs)
	}
	return &r, nil
}

func (h *ReportsHandler) JSON(c *gin.Context) {
	r, err := h.loadRow(c, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	durS := 0.0
	totals := metrics.Totals{}
	if r.Summary != nil {
		durS = r.Summary.DurationS
		totals = r.Summary.Totals
	}
	agg := report.Compute(r.Series, totals, durS)
	verdict := report.GradeVerdict(agg)
	insights := report.DeriveInsights(agg)

	// Cost estimate: optional override via ?cost_inputs=<json>; otherwise use stored.
	costInputs := r.CostInputs
	if raw := c.Query("cost_inputs"); raw != "" {
		var override cost.Inputs
		if err := json.Unmarshal([]byte(raw), &override); err == nil {
			costInputs = override
		}
	}
	costEst := cost.Compute(cost.LoadShape{
		AvgRPS:        agg.AvgRPS,
		PeakRPS:       agg.PeakRPS,
		BytesInAvg:    avgBytes(agg, totals),
		MeanLatencyMs: agg.MeanMs,
		P95LatencyMs:  agg.P95Ms,
		TotalRequests: agg.Requests,
	}, costInputs)

	c.JSON(http.StatusOK, gin.H{
		"id":          r.ID,
		"name":        r.Name,
		"status":      r.Status,
		"config":      r.Config,
		"summary":     r.Summary,
		"started_at":  r.StartedAt,
		"finished_at": r.FinishedAt,
		"created_by":  r.CreatedBy,
		"jira_id":     r.JiraID,
		"jira_link":   r.JiraLink,
		"notes":       r.Notes,
		"env_tag":     r.EnvTag,
		"series":      r.Series,
		"aggregates":   agg,
		"verdict":      verdict,
		"insights":     insights,
		"cost_inputs":  costInputs,
		"cost_estimate": costEst,
	})
}

func (h *ReportsHandler) HTML(c *gin.Context) {
	r, err := h.loadRow(c, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	key := c.Query("key")
	if key == "" {
		key = c.GetHeader("X-Access-Key")
	}
	// Resolve the tagged stack so the HTML report can list it.
	stackRows := make([]report.ResolvedStackRow, 0, len(r.CostInputs.Stack))
	if len(r.CostInputs.Stack) > 0 {
		// Re-run Compute purely to get ResolvedStack (cheap; pure CPU on tiny data).
		shape := cost.LoadShape{}
		if r.Summary != nil {
			agg := report.Compute(r.Series, r.Summary.Totals, r.Summary.DurationS)
			shape = cost.LoadShape{
				AvgRPS: agg.AvgRPS, PeakRPS: agg.PeakRPS,
				BytesInAvg:    avgBytes(agg, r.Summary.Totals),
				MeanLatencyMs: agg.MeanMs, P95LatencyMs: agg.P95Ms,
				TotalRequests: agg.Requests,
			}
		}
		est := cost.Compute(shape, r.CostInputs)
		for _, s := range est.ResolvedStack {
			stackRows = append(stackRows, report.ResolvedStackRow{
				Component: s.Component, Label: s.Label, Category: s.Category,
				Tier: s.Tier, TierLabel: s.TierLabel,
				Count: s.Count, MonthlyUSD: s.MonthlyUSD,
			})
		}
	}

	html, err := report.RenderHTML(report.ReportData{
		ID:         r.ID,
		Name:       r.Name,
		Status:     r.Status,
		Config:     r.Config,
		Summary:    r.Summary,
		StartedAt:  r.StartedAt,
		FinishedAt: r.FinishedAt,
		CreatedBy:  r.CreatedBy,
		JiraID:     r.JiraID,
		JiraLink:   r.JiraLink,
		Notes:      r.Notes,
		EnvTag:     r.EnvTag,
		Series:     r.Series,
		Stack:      stackRows,
		AccessKey:  key,
	})
	if err != nil {
		logger.Error("render html report failed", zap.String("run_id", r.ID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(html))
}

func (h *ReportsHandler) PDF(c *gin.Context) {
	r, err := h.loadRow(c, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	opts := report.PDFOptions{
		Orientation:   c.DefaultQuery("orientation", "portrait"),
		IncludeCharts: c.DefaultQuery("include_charts", "true") != "false",
	}
	pdf, err := report.RenderPDFFromDataWithOptions(report.ReportData{
		ID: r.ID, Name: r.Name, Status: r.Status, Config: r.Config,
		Summary: r.Summary, StartedAt: r.StartedAt, FinishedAt: r.FinishedAt,
		CreatedBy: r.CreatedBy, JiraID: r.JiraID, JiraLink: r.JiraLink,
		Notes: r.Notes, EnvTag: r.EnvTag, Series: r.Series,
	}, opts)
	if err != nil {
		logger.Error("render pdf failed", zap.String("run_id", r.ID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	filename := c.Query("filename")
	if filename == "" {
		filename = "apistress-" + r.ID + ".pdf"
	}
	if !strings.HasSuffix(strings.ToLower(filename), ".pdf") {
		filename += ".pdf"
	}
	// Sanitise filename to keep header valid.
	filename = sanitizeFilename(filename)
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(http.StatusOK, "application/pdf", pdf)
}

// avgBytes returns the average response body size from the load run.
// Falls back to 0 if no traffic was observed.
func avgBytes(agg report.Aggregates, _ metrics.Totals) float64 {
	if agg.Requests <= 0 {
		return 0
	}
	return float64(agg.BytesIn) / float64(agg.Requests)
}

func sanitizeFilename(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z',
			c >= 'A' && c <= 'Z',
			c >= '0' && c <= '9',
			c == '-' || c == '_' || c == '.' || c == ' ':
			out = append(out, c)
		default:
			out = append(out, '_')
		}
	}
	return string(out)
}
