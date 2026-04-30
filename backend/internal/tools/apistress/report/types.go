package report

import (
	"time"

	"github.com/choicetechlab/choicehammer/internal/tools/apistress/engine"
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/metrics"
)

type ReportData struct {
	ID         string
	Name       string
	Status     string
	Config     engine.TestConfig
	Summary    *engine.Summary
	StartedAt  *time.Time
	FinishedAt *time.Time
	CreatedBy  string
	JiraID     string
	JiraLink   string
	Notes      string
	EnvTag     string
	Series     []metrics.SecondBucket
	Stack      []ResolvedStackRow // resolved stack entries to print on report
	AccessKey  string             // forwarded into the embedded "Download PDF" link
}

// ResolvedStackRow mirrors cost.ResolvedStack but is duplicated here to avoid
// importing the cost package in the types package (cycle-safe).
type ResolvedStackRow struct {
	Component  string
	Label      string
	Category   string
	Tier       string
	TierLabel  string
	Count      int
	MonthlyUSD float64
}
