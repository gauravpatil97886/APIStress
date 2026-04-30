package metrics

import (
	"sync"

	hdr "github.com/HdrHistogram/hdrhistogram-go"
)

// Histogram wraps an HDR histogram with a mutex for concurrent writes.
// We accept some contention on writes so that snapshot reads can copy the
// underlying data without races. Writes only happen in the metrics batcher,
// not in the request hot path.
type Histogram struct {
	mu sync.Mutex
	h  *hdr.Histogram
}

func NewHistogram() *Histogram {
	return &Histogram{
		// 1 microsecond .. 60 seconds, 3 sig figs
		h: hdr.New(1, 60_000_000, 3),
	}
}

func (h *Histogram) RecordMicros(us int64) {
	if us < 1 {
		us = 1
	}
	if us > 60_000_000 {
		us = 60_000_000
	}
	h.mu.Lock()
	_ = h.h.RecordValue(us)
	h.mu.Unlock()
}

func (h *Histogram) Snapshot() HistSnapshot {
	h.mu.Lock()
	defer h.mu.Unlock()
	count := h.h.TotalCount()
	if count == 0 {
		return HistSnapshot{}
	}
	return HistSnapshot{
		Count: count,
		MinUs: h.h.Min(),
		MaxUs: h.h.Max(),
		MeanUs: h.h.Mean(),
		P50Us: h.h.ValueAtQuantile(50),
		P75Us: h.h.ValueAtQuantile(75),
		P90Us: h.h.ValueAtQuantile(90),
		P95Us: h.h.ValueAtQuantile(95),
		P99Us: h.h.ValueAtQuantile(99),
		P999Us: h.h.ValueAtQuantile(99.9),
	}
}

func (h *Histogram) Reset() {
	h.mu.Lock()
	h.h.Reset()
	h.mu.Unlock()
}

type HistSnapshot struct {
	Count  int64   `json:"count"`
	MinUs  int64   `json:"min_us"`
	MaxUs  int64   `json:"max_us"`
	MeanUs float64 `json:"mean_us"`
	P50Us  int64   `json:"p50_us"`
	P75Us  int64   `json:"p75_us"`
	P90Us  int64   `json:"p90_us"`
	P95Us  int64   `json:"p95_us"`
	P99Us  int64   `json:"p99_us"`
	P999Us int64   `json:"p999_us"`
}
