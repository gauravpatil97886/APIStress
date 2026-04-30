package engine

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/choicetechlab/choicehammer/internal/platform/logger"
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/metrics"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// LiveSubscriber receives bucket pushes for SSE.
type LiveSubscriber chan metrics.SecondBucket

type ManagedRun struct {
	ID        string
	TeamID    string
	Cfg       *TestConfig
	Runner    *Runner
	Status    RunStatus
	StartedAt time.Time
	Meta      RunMeta
	cancel    context.CancelFunc

	mu    sync.RWMutex
	subs  map[*LiveSubscriber]struct{}
}

func (m *ManagedRun) Subscribe() *LiveSubscriber {
	ch := make(LiveSubscriber, 64)
	m.mu.Lock()
	m.subs[&ch] = struct{}{}
	m.mu.Unlock()
	return &ch
}

func (m *ManagedRun) Unsubscribe(s *LiveSubscriber) {
	m.mu.Lock()
	delete(m.subs, s)
	close(*s)
	m.mu.Unlock()
}

func (m *ManagedRun) broadcast(b metrics.SecondBucket) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for s := range m.subs {
		select {
		case *s <- b:
		default:
		}
	}
}

type Manager struct {
	pool   *pgxpool.Pool
	mu     sync.RWMutex
	runs   map[string]*ManagedRun
	makeEx func(cfg *TestConfig) (Executor, error)

	onFinish FinishHook // optional — called once per run after summary is persisted
}

func NewManager(pool *pgxpool.Pool, makeEx func(cfg *TestConfig) (Executor, error)) *Manager {
	return &Manager{
		pool:   pool,
		runs:   make(map[string]*ManagedRun),
		makeEx: makeEx,
	}
}

// SetFinishHook registers a callback invoked when a run finishes. The hook
// runs in its own goroutine off the run's lifecycle so auto-attach errors
// (Jira down, network blip) never block the manager from cleaning up.
func (m *Manager) SetFinishHook(h FinishHook) { m.onFinish = h }

func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%s-%s-%s-%s-%s",
		hex.EncodeToString(b[0:4]),
		hex.EncodeToString(b[4:6]),
		hex.EncodeToString(b[6:8]),
		hex.EncodeToString(b[8:10]),
		hex.EncodeToString(b[10:16]),
	)
}

type RunMeta struct {
	CreatedBy      string                 `json:"created_by"`
	JiraID         string                 `json:"jira_id"`
	JiraLink       string                 `json:"jira_link"`
	Notes          string                 `json:"notes"`
	EnvTag         string                 `json:"env_tag"`     // Production, Broking, UAT
	CostInputs     map[string]interface{} `json:"cost_inputs"` // raw cost.Inputs as JSON
	// AutoAttachJira: when true and Jira integration is configured, the
	// run-finished hook auto-uploads the PDF + posts a summary comment
	// without the operator having to click anything on the report page.
	AutoAttachJira bool `json:"auto_attach_jira"`
}

// FinishHook is invoked once a run reaches a terminal state. The auto-attach
// path uses this to push the report to Jira without the runs handler having
// to know about Jira at all.
type FinishHook func(ctx context.Context, mr *ManagedRun)

func (m *Manager) Start(ctx context.Context, cfg *TestConfig, testID string, meta RunMeta, teamID string) (*ManagedRun, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	id := newID()
	cfgJSON, _ := json.Marshal(cfg)

	var testIDArg interface{}
	if testID != "" {
		testIDArg = testID
	}
	var teamArg interface{}
	if teamID != "" {
		teamArg = teamID
	}
	costInputsJSON, _ := json.Marshal(meta.CostInputs)
	if string(costInputsJSON) == "null" {
		costInputsJSON = []byte("{}")
	}
	_, err := m.pool.Exec(ctx,
		`INSERT INTO runs (id, test_id, name, config, status, started_at, created_by, jira_id, jira_link, notes, env_tag, cost_inputs, team_id)
		 VALUES ($1, $2, $3, $4, 'running', NOW(), $5, $6, $7, $8, $9, $10, $11)`,
		id, testIDArg, cfg.Name, cfgJSON, meta.CreatedBy, meta.JiraID, meta.JiraLink, meta.Notes, meta.EnvTag, costInputsJSON, teamArg,
	)
	if err != nil {
		logger.Error("failed to insert run", zap.String("run_id", id), zap.Error(err))
		return nil, fmt.Errorf("insert run: %w", err)
	}
	logger.Info("run started",
		zap.String("run_id", id),
		zap.String("name", cfg.Name),
		zap.String("protocol", string(cfg.Protocol)),
		zap.String("url", cfg.Request.URL),
		zap.Int("vus", cfg.VUs),
		zap.String("pattern", string(cfg.Pattern)),
		zap.Duration("duration", cfg.TotalDuration()),
		zap.String("created_by", meta.CreatedBy),
		zap.String("jira_id", meta.JiraID),
		zap.String("jira_link", meta.JiraLink),
		zap.String("env_tag", meta.EnvTag),
	)

	runner := NewRunner(id, cfg, func() (Executor, error) {
		return m.makeEx(cfg)
	})

	mr := &ManagedRun{
		ID:        id,
		TeamID:    teamID,
		Cfg:       cfg,
		Runner:    runner,
		Status:    RunRunning,
		StartedAt: time.Now(),
		Meta:      meta,
		subs:      make(map[*LiveSubscriber]struct{}),
	}

	runCtx, cancel := context.WithCancel(context.Background())
	mr.cancel = cancel

	runner.OnBucket = func(b metrics.SecondBucket) {
		snap, _ := json.Marshal(b)
		if _, err := m.pool.Exec(context.Background(),
			`INSERT INTO run_metrics (run_id, ts, snapshot) VALUES ($1, $2, $3)`,
			id, b.Ts, snap,
		); err != nil {
			logger.Warn("failed to persist bucket", zap.String("run_id", id), zap.Error(err))
		}
		logger.Debug("metrics bucket",
			zap.String("run_id", id),
			zap.Int64("requests", b.Requests),
			zap.Float64("p95_ms", b.P95Ms),
			zap.Float64("p99_ms", b.P99Ms),
			zap.Int64("vus", b.ActiveVUs),
		)
		mr.broadcast(b)
	}
	runner.OnStatus = func(s RunStatus) {
		mr.mu.Lock()
		mr.Status = s
		mr.mu.Unlock()
		logger.Info("run status changed", zap.String("run_id", id), zap.String("status", string(s)))
	}

	m.mu.Lock()
	m.runs[id] = mr
	m.mu.Unlock()

	go func() {
		_ = runner.Run(runCtx)
		summary := buildSummary(runner)
		summaryJSON, _ := json.Marshal(summary)
		if _, err := m.pool.Exec(context.Background(),
			`UPDATE runs SET status=$1, finished_at=NOW(), summary=$2 WHERE id=$3`,
			string(runner.Status()), summaryJSON, id,
		); err != nil {
			logger.Error("failed to finalize run", zap.String("run_id", id), zap.Error(err))
		}
		logger.Info("run finished",
			zap.String("run_id", id),
			zap.String("status", string(runner.Status())),
			zap.Int64("total_requests", summary.Totals.Requests),
			zap.Int64("total_errors", summary.Totals.Errors),
			zap.Float64("rps", summary.RPS),
			zap.Float64("error_rate", summary.ErrorRate),
			zap.Float64("duration_s", summary.DurationS),
		)
		// close all subscribers
		mr.mu.Lock()
		for s := range mr.subs {
			close(*s)
			delete(mr.subs, s)
		}
		mr.mu.Unlock()
		// Fire registered finish hook (e.g. auto-attach to Jira). Detached
		// goroutine so a slow Jira upload can't block the manager.
		if m.onFinish != nil {
			hook := m.onFinish
			go func() {
				defer func() {
					if r := recover(); r != nil {
						logger.Error("finish hook panicked", zap.String("run_id", id), zap.Any("panic", r))
					}
				}()
				hook(context.Background(), mr)
			}()
		}
	}()
	return mr, nil
}

func (m *Manager) Get(id string) (*ManagedRun, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	mr, ok := m.runs[id]
	return mr, ok
}

func (m *Manager) Stop(id string) bool {
	m.mu.RLock()
	mr, ok := m.runs[id]
	m.mu.RUnlock()
	if !ok {
		return false
	}
	if mr.cancel != nil {
		mr.cancel()
	}
	return true
}

func (m *Manager) List() []*ManagedRun {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*ManagedRun, 0, len(m.runs))
	for _, r := range m.runs {
		out = append(out, r)
	}
	return out
}

type Summary struct {
	Totals    metrics.Totals         `json:"totals"`
	Series    []metrics.SecondBucket `json:"series"`
	StartedAt time.Time              `json:"started_at"`
	EndedAt   time.Time              `json:"ended_at"`
	DurationS float64                `json:"duration_s"`
	RPS       float64                `json:"rps"`
	ErrorRate float64                `json:"error_rate"`
}

func buildSummary(r *Runner) Summary {
	totals := r.Collector.Totals()
	series := r.Collector.Buckets()
	end := time.Now()
	dur := end.Sub(r.Collector.StartedAt).Seconds()
	rps := 0.0
	if dur > 0 {
		rps = float64(totals.Requests) / dur
	}
	errRate := 0.0
	if totals.Requests > 0 {
		errRate = float64(totals.Errors) / float64(totals.Requests)
	}
	return Summary{
		Totals:    totals,
		Series:    series,
		StartedAt: r.Collector.StartedAt,
		EndedAt:   end,
		DurationS: dur,
		RPS:       rps,
		ErrorRate: errRate,
	}
}
