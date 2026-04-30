package engine

import (
	"context"
	"time"

	"github.com/choicetechlab/choicehammer/internal/tools/apistress/metrics"
)

// Batcher drains the results channel and feeds the collector.
// Once per second it flushes a SecondBucket and notifies subscribers.
type Batcher struct {
	Results   <-chan Result
	Collector *metrics.Collector
	OnBucket  func(b metrics.SecondBucket)
}

func (b *Batcher) Run(ctx context.Context) {
	tick := time.NewTicker(1 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			b.drain()
			b.flush(time.Now())
			return
		case <-tick.C:
			b.flush(time.Now())
		case res, ok := <-b.Results:
			if !ok {
				b.flush(time.Now())
				return
			}
			b.Collector.Record(res.DurationUs, res.Status, res.BytesIn, res.BytesOut, !res.OK(), res.Err)
		}
	}
}

func (b *Batcher) drain() {
	for {
		select {
		case res, ok := <-b.Results:
			if !ok {
				return
			}
			b.Collector.Record(res.DurationUs, res.Status, res.BytesIn, res.BytesOut, !res.OK(), res.Err)
		default:
			return
		}
	}
}

func (b *Batcher) flush(ts time.Time) {
	bucket := b.Collector.FlushBucket(ts)
	if b.OnBucket != nil {
		b.OnBucket(bucket)
	}
}
