package engine

import (
	"context"
	"time"
)

// Executor is the protocol-specific request runner.
type Executor interface {
	Execute(ctx context.Context) Result
	Close()
}

// VU represents a single virtual user goroutine.
// It loops sending requests until context is cancelled.
type VU struct {
	ID      int
	Exec    Executor
	Results chan<- Result
	ThinkMs int
}

func (v *VU) Run(ctx context.Context) {
	defer v.Exec.Close()
	for {
		if ctx.Err() != nil {
			return
		}
		res := v.Exec.Execute(ctx)
		select {
		case v.Results <- res:
		case <-ctx.Done():
			return
		}
		if v.ThinkMs > 0 {
			t := time.NewTimer(time.Duration(v.ThinkMs) * time.Millisecond)
			select {
			case <-t.C:
			case <-ctx.Done():
				t.Stop()
				return
			}
		}
	}
}
