package report

import (
	"time"

	"github.com/choicetechlab/choicehammer/internal/engine"
	"github.com/choicetechlab/choicehammer/internal/metrics"
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
	AccessKey  string // forwarded into the embedded "Download PDF" link
}
