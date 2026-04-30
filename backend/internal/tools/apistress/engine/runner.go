package engine

import (
	"context"
	"sync"
	"time"

	"github.com/choicetechlab/choicehammer/internal/tools/apistress/metrics"
)

// ExecutorFactory returns a fresh per-VU Executor.
type ExecutorFactory func() (Executor, error)

type Runner struct {
	RunID     string
	Cfg       *TestConfig
	Factory   ExecutorFactory
	Collector *metrics.Collector

	OnBucket func(metrics.SecondBucket)
	OnStatus func(RunStatus)

	results chan Result
	sched   *Scheduler
	sem     Semaphore
	vuWg    sync.WaitGroup

	mu     sync.Mutex
	status RunStatus
}

func NewRunner(runID string, cfg *TestConfig, factory ExecutorFactory) *Runner {
	if err := cfg.Validate(); err != nil {
		panic(err)
	}
	bufSize := cfg.VUs * 16
	if bufSize < 1024 {
		bufSize = 1024
	}
	return &Runner{
		RunID:     runID,
		Cfg:       cfg,
		Factory:   factory,
		Collector: metrics.NewCollector(),
		results:   make(chan Result, bufSize),
		sched:     NewScheduler(cfg),
		sem:       NewSemaphore(cfg.VUs),
		status:    RunPending,
	}
}

func (r *Runner) setStatus(s RunStatus) {
	r.mu.Lock()
	r.status = s
	r.mu.Unlock()
	if r.OnStatus != nil {
		r.OnStatus(s)
	}
}

func (r *Runner) Status() RunStatus {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.status
}

// Run blocks until the test completes or the context is cancelled.
func (r *Runner) Run(ctx context.Context) error {
	r.setStatus(RunRunning)

	batcherCtx, batcherCancel := context.WithCancel(ctx)
	batcher := &Batcher{
		Results:   r.results,
		Collector: r.Collector,
		OnBucket:  r.OnBucket,
	}
	batcherDone := make(chan struct{})
	go func() {
		batcher.Run(batcherCtx)
		close(batcherDone)
	}()

	schedCtx, schedCancel := context.WithCancel(ctx)
	go r.sched.Run(schedCtx)

	supervisorCtx, supervisorCancel := context.WithCancel(ctx)

	// Supervisor: every 200ms, ensure spawned VU count == sched.Target()
	tick := time.NewTicker(200 * time.Millisecond)
	deadline := time.NewTimer(r.Cfg.TotalDuration() + 500*time.Millisecond)
	defer deadline.Stop()
	defer tick.Stop()

	active := 0
	vuCancels := make([]context.CancelFunc, 0, r.Cfg.VUs)

loop:
	for {
		select {
		case <-ctx.Done():
			break loop
		case <-deadline.C:
			break loop
		case <-tick.C:
			target := r.sched.Target()
			if target > r.Cfg.VUs {
				target = r.Cfg.VUs
			}
			for active < target {
				vuCtx, cancel := context.WithCancel(supervisorCtx)
				vuCancels = append(vuCancels, cancel)
				exec, err := r.Factory()
				if err != nil {
					cancel()
					break
				}
				vu := &VU{
					ID:      active + 1,
					Exec:    exec,
					Results: r.results,
					ThinkMs: r.Cfg.ThinkTimeMs,
				}
				r.sem.Acquire()
				r.vuWg.Add(1)
				active++
				go func() {
					defer r.sem.Release()
					defer r.vuWg.Done()
					vu.Run(vuCtx)
				}()
			}
			for active > target && len(vuCancels) > 0 {
				last := len(vuCancels) - 1
				vuCancels[last]()
				vuCancels = vuCancels[:last]
				active--
			}
			r.Collector.SetActiveVUs(active)
		}
	}

	supervisorCancel()
	schedCancel()
	r.vuWg.Wait()
	close(r.results)
	batcherCancel()
	<-batcherDone

	if ctx.Err() == context.Canceled {
		r.setStatus(RunCancelled)
	} else {
		r.setStatus(RunFinished)
	}
	return nil
}
