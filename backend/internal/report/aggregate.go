package report

import (
	"math"

	"github.com/choicetechlab/choicehammer/internal/metrics"
)

// Aggregates summarises a full run's series into single numbers.
// Per-second buckets are weighted by request count so quiet seconds don't
// drag the average down.
type Aggregates struct {
	Requests   int64
	Errors     int64
	Successes  int64
	SuccessPct float64
	ErrorPct   float64

	DurationS  float64
	AvgRPS     float64
	PeakRPS    float64
	BytesIn    int64

	MinMs    float64
	MaxMs    float64
	MeanMs   float64
	P50Ms    float64
	P75Ms    float64
	P90Ms    float64
	P95Ms    float64
	P99Ms    float64
	StdDevMs float64

	PeakVUs int64

	StatusCounts map[int]int64
	ErrorReasons map[string]int64
}

func Compute(series []metrics.SecondBucket, totals metrics.Totals, durationS float64) Aggregates {
	a := Aggregates{
		Requests:     totals.Requests,
		Errors:       totals.Errors,
		StatusCounts: totals.Statuses,
		ErrorReasons: totals.ErrorReasons,
		BytesIn:      totals.BytesIn,
		DurationS:    durationS,
	}
	a.Successes = a.Requests - a.Errors
	if a.Requests > 0 {
		a.SuccessPct = float64(a.Successes) / float64(a.Requests) * 100
		a.ErrorPct = float64(a.Errors) / float64(a.Requests) * 100
	}
	if durationS > 0 {
		a.AvgRPS = float64(a.Requests) / durationS
	}

	if len(series) == 0 {
		return a
	}

	var sumW float64
	var sumMean, sumP50, sumP75, sumP90, sumP95, sumP99 float64
	a.MinMs = math.MaxFloat64

	for _, b := range series {
		w := float64(b.Requests)
		if w <= 0 {
			continue
		}
		sumW += w
		sumMean += b.MeanMs * w
		sumP50 += b.P50Ms * w
		sumP75 += b.P75Ms * w
		sumP90 += b.P90Ms * w
		sumP95 += b.P95Ms * w
		sumP99 += b.P99Ms * w

		if b.MinMs > 0 && b.MinMs < a.MinMs {
			a.MinMs = b.MinMs
		}
		if b.MaxMs > a.MaxMs {
			a.MaxMs = b.MaxMs
		}
		if float64(b.Requests) > a.PeakRPS {
			a.PeakRPS = float64(b.Requests)
		}
		if b.ActiveVUs > a.PeakVUs {
			a.PeakVUs = b.ActiveVUs
		}
	}
	if a.MinMs == math.MaxFloat64 {
		a.MinMs = 0
	}
	if sumW > 0 {
		a.MeanMs = sumMean / sumW
		a.P50Ms = sumP50 / sumW
		a.P75Ms = sumP75 / sumW
		a.P90Ms = sumP90 / sumW
		a.P95Ms = sumP95 / sumW
		a.P99Ms = sumP99 / sumW
	}

	// Approximate std dev from per-bucket means.
	if sumW > 0 {
		var varSum float64
		for _, b := range series {
			if b.Requests <= 0 {
				continue
			}
			d := b.MeanMs - a.MeanMs
			varSum += d * d * float64(b.Requests)
		}
		a.StdDevMs = math.Sqrt(varSum / sumW)
	}

	return a
}
