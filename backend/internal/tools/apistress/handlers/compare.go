package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/choicetechlab/choicehammer/internal/platform/api/middleware"
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/engine"
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/metrics"
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/report"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CompareHandler struct {
	DB *pgxpool.Pool
}

type compareSide struct {
	ID         string                 `json:"id"`
	Name       string                 `json:"name"`
	Status     string                 `json:"status"`
	CreatedBy  string                 `json:"created_by"`
	JiraID     string                 `json:"jira_id"`
	JiraLink   string                 `json:"jira_link"`
	EnvTag     string                 `json:"env_tag"`
	StartedAt  *time.Time             `json:"started_at"`
	FinishedAt *time.Time             `json:"finished_at"`
	Config     engine.TestConfig      `json:"config"`
	Aggregates report.Aggregates      `json:"aggregates"`
	Verdict    report.Verdict         `json:"verdict"`
	Series     []metrics.SecondBucket `json:"series"`
}

func (h *CompareHandler) Compare(c *gin.Context) {
	a := c.Query("a")
	b := c.Query("b")
	if a == "" || b == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "two run ids required as ?a= and ?b="})
		return
	}
	sideA, err := h.loadSide(c, a)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "left run (a) not found: " + err.Error()})
		return
	}
	sideB, err := h.loadSide(c, b)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "right run (b) not found: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"a":      sideA,
		"b":      sideB,
		"deltas": computeDeltas(sideA.Aggregates, sideB.Aggregates),
	})
}

func (h *CompareHandler) loadSide(c *gin.Context, id string) (*compareSide, error) {
	team := middleware.TeamID(c)
	row := h.DB.QueryRow(c.Request.Context(),
		`SELECT id, name, status, started_at, finished_at, summary, config,
		        created_by, jira_id, jira_link, env_tag
		   FROM runs WHERE id=$1 AND team_id=$2`, id, team)
	var s compareSide
	var summaryRaw, cfgRaw []byte
	if err := row.Scan(&s.ID, &s.Name, &s.Status, &s.StartedAt, &s.FinishedAt,
		&summaryRaw, &cfgRaw, &s.CreatedBy, &s.JiraID, &s.JiraLink, &s.EnvTag); err != nil {
		return nil, err
	}
	_ = json.Unmarshal(cfgRaw, &s.Config)
	totals := metrics.Totals{}
	durS := 0.0
	if len(summaryRaw) > 0 {
		var sum engine.Summary
		if err := json.Unmarshal(summaryRaw, &sum); err == nil {
			s.Series = sum.Series
			totals = sum.Totals
			durS = sum.DurationS
		}
	}
	s.Aggregates = report.Compute(s.Series, totals, durS)
	s.Verdict = report.GradeVerdict(s.Aggregates)
	return &s, nil
}

type Delta struct {
	Metric    string  `json:"metric"`
	A         float64 `json:"a"`
	B         float64 `json:"b"`
	AbsDelta  float64 `json:"abs_delta"`
	PctDelta  float64 `json:"pct_delta"`
	Direction string  `json:"direction"` // "better" | "worse" | "same"
	Unit      string  `json:"unit"`
}

func computeDeltas(a, b report.Aggregates) []Delta {
	mk := func(metric string, av, bv float64, unit string, lowerIsBetter bool) Delta {
		d := bv - av
		pct := 0.0
		if av != 0 {
			pct = (d / av) * 100
		}
		dir := "same"
		switch {
		case d == 0:
			dir = "same"
		case lowerIsBetter && d < 0, !lowerIsBetter && d > 0:
			dir = "better"
		default:
			dir = "worse"
		}
		return Delta{Metric: metric, A: av, B: bv, AbsDelta: d, PctDelta: pct, Direction: dir, Unit: unit}
	}
	return []Delta{
		mk("Total requests",   float64(a.Requests),   float64(b.Requests),   "",     false),
		mk("Throughput",       a.AvgRPS,              b.AvgRPS,              "rps",  false),
		mk("Peak RPS",         a.PeakRPS,             b.PeakRPS,             "rps",  false),
		mk("Success rate",     a.SuccessPct,          b.SuccessPct,          "%",    false),
		mk("Error rate",       a.ErrorPct,            b.ErrorPct,            "%",    true),
		mk("p50 latency",      a.P50Ms,               b.P50Ms,               "ms",   true),
		mk("p75 latency",      a.P75Ms,               b.P75Ms,               "ms",   true),
		mk("p90 latency",      a.P90Ms,               b.P90Ms,               "ms",   true),
		mk("p95 latency",      a.P95Ms,               b.P95Ms,               "ms",   true),
		mk("p99 latency",      a.P99Ms,               b.P99Ms,               "ms",   true),
		mk("Mean latency",     a.MeanMs,              b.MeanMs,              "ms",   true),
		mk("Max latency",      a.MaxMs,               b.MaxMs,               "ms",   true),
		mk("Std deviation",    a.StdDevMs,            b.StdDevMs,            "ms",   true),
		mk("Peak VUs",         float64(a.PeakVUs),    float64(b.PeakVUs),    "",     false),
	}
}
