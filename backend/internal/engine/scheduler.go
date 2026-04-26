package engine

import (
	"context"
	"sync/atomic"
	"time"
)

// Scheduler computes the desired VU count over time and exposes it via Target().
// The runner spawns or stops VUs to match Target().
type Scheduler struct {
	cfg     *TestConfig
	target  atomic.Int64
	startAt time.Time
}

func NewScheduler(cfg *TestConfig) *Scheduler {
	return &Scheduler{cfg: cfg}
}

func (s *Scheduler) Target() int {
	return int(s.target.Load())
}

func (s *Scheduler) Run(ctx context.Context) {
	s.startAt = time.Now()
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()

	for {
		select {
		case <-ctx.Done():
			s.target.Store(0)
			return
		case now := <-tick.C:
			elapsed := now.Sub(s.startAt)
			s.target.Store(int64(s.computeTarget(elapsed)))
			if elapsed >= s.cfg.TotalDuration() {
				s.target.Store(0)
				return
			}
		}
	}
}

func (s *Scheduler) computeTarget(elapsed time.Duration) int {
	switch s.cfg.Pattern {
	case PatternConstant:
		return s.cfg.VUs
	case PatternRamp:
		total := s.cfg.TotalDuration()
		if total <= 0 {
			return s.cfg.VUs
		}
		ratio := float64(elapsed) / float64(total)
		if ratio > 1 {
			ratio = 1
		}
		return int(float64(s.cfg.VUs) * ratio)
	case PatternSpike:
		// 10% warm-up, instant spike to full, hold, fall.
		total := s.cfg.TotalDuration()
		warm := time.Duration(float64(total) * 0.1)
		fall := time.Duration(float64(total) * 0.9)
		switch {
		case elapsed < warm:
			return max(1, s.cfg.VUs/10)
		case elapsed < fall:
			return s.cfg.VUs
		default:
			return max(1, s.cfg.VUs/10)
		}
	case PatternStages:
		return stageTarget(s.cfg.Stages, elapsed)
	default:
		return s.cfg.VUs
	}
}

func stageTarget(stages []Stage, elapsed time.Duration) int {
	if len(stages) == 0 {
		return 0
	}
	prevTarget := 0
	prevEnd := time.Duration(0)
	for _, st := range stages {
		stageEnd := prevEnd + time.Duration(st.DurationSec)*time.Second
		if elapsed <= stageEnd {
			span := stageEnd - prevEnd
			if span <= 0 {
				return st.TargetVUs
			}
			progress := float64(elapsed-prevEnd) / float64(span)
			if progress < 0 {
				progress = 0
			}
			if progress > 1 {
				progress = 1
			}
			return prevTarget + int(float64(st.TargetVUs-prevTarget)*progress)
		}
		prevTarget = st.TargetVUs
		prevEnd = stageEnd
	}
	return prevTarget
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
