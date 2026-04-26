package metrics

import "time"

type LiveSnapshot struct {
	RunID       string         `json:"run_id"`
	Ts          time.Time      `json:"ts"`
	ElapsedSec  float64        `json:"elapsed_sec"`
	ActiveVUs   int64          `json:"active_vus"`
	Totals      Totals         `json:"totals"`
	Latest      SecondBucket   `json:"latest"`
	Series      []SecondBucket `json:"series"`
	RPS         float64        `json:"rps"`
	ErrorRate   float64        `json:"error_rate"`
	Status      string         `json:"status"`
}

func BuildLiveSnapshot(runID, status string, c *Collector) LiveSnapshot {
	totals := c.Totals()
	buckets := c.Buckets()
	var latest SecondBucket
	if len(buckets) > 0 {
		latest = buckets[len(buckets)-1]
	}
	elapsed := time.Since(c.StartedAt).Seconds()
	rps := 0.0
	if elapsed > 0 {
		rps = float64(totals.Requests) / elapsed
	}
	errRate := 0.0
	if totals.Requests > 0 {
		errRate = float64(totals.Errors) / float64(totals.Requests)
	}
	return LiveSnapshot{
		RunID:      runID,
		Ts:         time.Now(),
		ElapsedSec: elapsed,
		ActiveVUs:  c.ActiveVUs(),
		Totals:     totals,
		Latest:     latest,
		Series:     buckets,
		RPS:        rps,
		ErrorRate:  errRate,
		Status:     status,
	}
}
