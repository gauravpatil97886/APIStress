package metrics

import (
	"sync"
	"sync/atomic"
	"time"
)

// Collector is a single-producer (batcher) / multi-reader aggregator.
// Hot path counters are atomics; the histogram has its own lock.
type Collector struct {
	StartedAt time.Time

	totalRequests atomic.Int64
	totalErrors   atomic.Int64
	bytesIn       atomic.Int64
	bytesOut      atomic.Int64

	// per-second buckets for the live chart
	mu      sync.Mutex
	buckets []SecondBucket

	hist     *Histogram
	statuses map[int]*atomic.Int64
	statusMu sync.RWMutex

	errMsgs   map[string]*atomic.Int64
	errMsgsMu sync.RWMutex

	currentVUs atomic.Int64
}

type SecondBucket struct {
	Ts        time.Time `json:"ts"`
	Requests  int64     `json:"requests"`
	Errors    int64     `json:"errors"`
	P50Ms     float64   `json:"p50_ms"`
	P75Ms     float64   `json:"p75_ms"`
	P90Ms     float64   `json:"p90_ms"`
	P95Ms     float64   `json:"p95_ms"`
	P99Ms     float64   `json:"p99_ms"`
	MeanMs    float64   `json:"mean_ms"`
	MinMs     float64   `json:"min_ms"`
	MaxMs     float64   `json:"max_ms"`
	BytesIn   int64     `json:"bytes_in"`
	BytesOut  int64     `json:"bytes_out"`
	ActiveVUs int64     `json:"active_vus"`
}

func NewCollector() *Collector {
	return &Collector{
		StartedAt: time.Now(),
		hist:      NewHistogram(),
		statuses:  make(map[int]*atomic.Int64),
		errMsgs:   make(map[string]*atomic.Int64),
		buckets:   make([]SecondBucket, 0, 600),
	}
}

func (c *Collector) SetActiveVUs(n int) { c.currentVUs.Store(int64(n)) }
func (c *Collector) ActiveVUs() int64   { return c.currentVUs.Load() }

func (c *Collector) Record(durationUs int64, status int, bytesIn, bytesOut int64, isErr bool, errMsg string) {
	c.totalRequests.Add(1)
	if isErr {
		c.totalErrors.Add(1)
		if errMsg != "" {
			c.incErrMsg(errMsg)
		}
	}
	if bytesIn > 0 {
		c.bytesIn.Add(bytesIn)
	}
	if bytesOut > 0 {
		c.bytesOut.Add(bytesOut)
	}
	c.hist.RecordMicros(durationUs)
	c.incStatus(status)
}

func (c *Collector) incErrMsg(msg string) {
	c.errMsgsMu.RLock()
	ctr, ok := c.errMsgs[msg]
	c.errMsgsMu.RUnlock()
	if !ok {
		c.errMsgsMu.Lock()
		ctr, ok = c.errMsgs[msg]
		if !ok {
			ctr = &atomic.Int64{}
			c.errMsgs[msg] = ctr
		}
		c.errMsgsMu.Unlock()
	}
	ctr.Add(1)
}

func (c *Collector) incStatus(status int) {
	c.statusMu.RLock()
	ctr, ok := c.statuses[status]
	c.statusMu.RUnlock()
	if !ok {
		c.statusMu.Lock()
		ctr, ok = c.statuses[status]
		if !ok {
			ctr = &atomic.Int64{}
			c.statuses[status] = ctr
		}
		c.statusMu.Unlock()
	}
	ctr.Add(1)
}

// FlushBucket called once per second by the batcher.
// We use a windowed histogram approach: snapshot then reset for per-second
// percentile accuracy in the live chart, while keeping running totals.
func (c *Collector) FlushBucket(ts time.Time) SecondBucket {
	snap := c.hist.Snapshot()
	c.hist.Reset()

	bucket := SecondBucket{
		Ts:        ts,
		Requests:  snap.Count,
		P50Ms:     float64(snap.P50Us) / 1000.0,
		P75Ms:     float64(snap.P75Us) / 1000.0,
		P90Ms:     float64(snap.P90Us) / 1000.0,
		P95Ms:     float64(snap.P95Us) / 1000.0,
		P99Ms:     float64(snap.P99Us) / 1000.0,
		MeanMs:    snap.MeanUs / 1000.0,
		MinMs:     float64(snap.MinUs) / 1000.0,
		MaxMs:     float64(snap.MaxUs) / 1000.0,
		BytesIn:   c.bytesIn.Load(),
		BytesOut:  c.bytesOut.Load(),
		ActiveVUs: c.currentVUs.Load(),
		Errors:    c.totalErrors.Load(),
	}
	c.mu.Lock()
	c.buckets = append(c.buckets, bucket)
	c.mu.Unlock()
	return bucket
}

func (c *Collector) Buckets() []SecondBucket {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]SecondBucket, len(c.buckets))
	copy(out, c.buckets)
	return out
}

func (c *Collector) Totals() Totals {
	c.statusMu.RLock()
	statusCopy := make(map[int]int64, len(c.statuses))
	for k, v := range c.statuses {
		statusCopy[k] = v.Load()
	}
	c.statusMu.RUnlock()

	c.errMsgsMu.RLock()
	errMsgsCopy := make(map[string]int64, len(c.errMsgs))
	for k, v := range c.errMsgs {
		errMsgsCopy[k] = v.Load()
	}
	c.errMsgsMu.RUnlock()

	return Totals{
		Requests:    c.totalRequests.Load(),
		Errors:      c.totalErrors.Load(),
		BytesIn:     c.bytesIn.Load(),
		BytesOut:    c.bytesOut.Load(),
		Statuses:    statusCopy,
		ErrorReasons: errMsgsCopy,
	}
}

type Totals struct {
	Requests     int64            `json:"requests"`
	Errors       int64            `json:"errors"`
	BytesIn      int64            `json:"bytes_in"`
	BytesOut     int64            `json:"bytes_out"`
	Statuses     map[int]int64    `json:"statuses"`
	ErrorReasons map[string]int64 `json:"error_reasons"`
}
