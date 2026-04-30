package kavach

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/choicetechlab/choicehammer/internal/engine"
	"github.com/choicetechlab/choicehammer/internal/logger"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// Event is the SSE wire shape — a single tagged-union message broadcast to
// every subscriber as the scan progresses. The frontend dispatches on Kind.
type Event struct {
	Kind     string                 `json:"kind"` // "snapshot" | "progress" | "test" | "finding" | "done"
	ScanID   string                 `json:"scan_id"`
	Status   string                 `json:"status,omitempty"`
	Finding  *Finding               `json:"finding,omitempty"`
	Test     *TestResult            `json:"test,omitempty"`
	Progress *ProgressFrame         `json:"progress,omitempty"`
	Summary  map[string]interface{} `json:"summary,omitempty"`
}

// ProgressFrame is a per-category counter snapshot the frontend uses to
// fill the per-category progress bars on the live view.
type ProgressFrame struct {
	Done     int                    `json:"done"`
	Total    int                    `json:"total"`
	Category Category               `json:"category,omitempty"` // empty when this is an overall tick
	Counts   map[Severity]int       `json:"counts"`
	Pct      int                    `json:"pct"`
	Elapsed  int64                  `json:"elapsed_ms"`
}

// Subscriber is a buffered channel the SSE handler drains. Buffer size of
// 64 matches engine.LiveSubscriber — chosen so a slow consumer briefly
// blocking doesn't stall the runner.
type Subscriber chan Event

// Scan holds the live state of one in-flight or recently-finished run.
// Same lifecycle pattern as engine.ManagedRun — Subscribe + Unsubscribe +
// broadcast under mu.
type Scan struct {
	ID         string
	TeamID     string
	Target     Target
	Settings   Settings
	Status     string // pending | running | completed | stopped | failed
	StartedAt  time.Time
	FinishedAt *time.Time
	CreatedBy  string
	Findings   []*Finding
	// TestResults captures pass/fail for every test that ran during the
	// scan — populated by the runner, consumed by finalize() so the saved
	// summary reflects the full VAPT sweep, not just the flagged checks.
	TestResults []TestResult
	cancel      context.CancelFunc

	mu   sync.RWMutex
	subs map[*Subscriber]struct{}
}

func (s *Scan) Subscribe() *Subscriber {
	ch := make(Subscriber, 64)
	s.mu.Lock()
	s.subs[&ch] = struct{}{}
	s.mu.Unlock()
	return &ch
}

func (s *Scan) Unsubscribe(sub *Subscriber) {
	s.mu.Lock()
	if _, ok := s.subs[sub]; ok {
		delete(s.subs, sub)
		close(*sub)
	}
	s.mu.Unlock()
}

func (s *Scan) broadcast(ev Event) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for sub := range s.subs {
		select {
		case *sub <- ev:
		default:
			// Drop on slow consumer — don't stall the runner.
		}
	}
}

func (s *Scan) closeSubs() {
	s.mu.Lock()
	for sub := range s.subs {
		close(*sub)
		delete(s.subs, sub)
	}
	s.mu.Unlock()
}

// Manager keeps a registry of in-flight scans, exposes Start/Get/Stop
// mirroring engine.Manager but for security scans.
type Manager struct {
	pool  *pgxpool.Pool
	mu    sync.RWMutex
	scans map[string]*Scan
}

func NewManager(pool *pgxpool.Pool) *Manager {
	return &Manager{pool: pool, scans: make(map[string]*Scan)}
}

// Start kicks off a scan. The DB row is inserted synchronously so the
// caller can return the new scan ID; the actual test loop runs in a
// detached goroutine.
func (m *Manager) Start(ctx context.Context, teamID string, target Target, settings Settings, createdBy string) (*Scan, error) {
	if err := validateSettings(&settings); err != nil {
		return nil, err
	}
	id := newScanID()

	reqJSON, _ := json.Marshal(map[string]interface{}{
		"method":  target.BaseRequest.Method,
		"url":     target.BaseRequest.URL,
		"headers": RedactHeaders(target.BaseRequest.Headers),
		"body":    RedactBody(target.BaseRequest.Body),
	})
	settingsJSON, _ := json.Marshal(settings)

	var teamArg interface{}
	if teamID != "" {
		teamArg = teamID
	}
	if _, err := m.pool.Exec(ctx, `
		INSERT INTO vapt_scans (id, team_id, target_url, target_host, status, request_snapshot, settings, created_by)
		VALUES ($1, $2, $3, $4, 'running', $5, $6, $7)`,
		id, teamArg, target.BaseRequest.URL, target.Host, reqJSON, settingsJSON, createdBy,
	); err != nil {
		return nil, fmt.Errorf("insert vapt_scan: %w", err)
	}

	runCtx, cancel := context.WithTimeout(context.Background(), settings.MaxDuration)
	scan := &Scan{
		ID:        id,
		TeamID:    teamID,
		Target:    target,
		Settings:  settings,
		Status:    "running",
		StartedAt: time.Now(),
		CreatedBy: createdBy,
		cancel:    cancel,
		subs:      make(map[*Subscriber]struct{}),
	}

	m.mu.Lock()
	m.scans[id] = scan
	m.mu.Unlock()

	go func() {
		defer cancel()
		runScan(runCtx, m.pool, scan)
	}()

	logger.Info("vapt scan started",
		zap.String("scan_id", id),
		zap.String("target_host", target.Host),
		zap.String("team", teamID),
	)
	return scan, nil
}

func (m *Manager) Get(id string) (*Scan, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.scans[id]
	return s, ok
}

func (m *Manager) Stop(id string) bool {
	m.mu.RLock()
	s, ok := m.scans[id]
	m.mu.RUnlock()
	if !ok {
		return false
	}
	if s.cancel != nil {
		s.cancel()
	}
	return true
}

// validateSettings clamps user-provided settings against safety ceilings.
func validateSettings(s *Settings) error {
	if len(s.EnabledCategories) == 0 {
		s.EnabledCategories = DefaultSettings().EnabledCategories
	}
	if s.RateLimitRPS <= 0 {
		s.RateLimitRPS = 5
	}
	if s.RateLimitRPS > HardRateLimitCeiling {
		s.RateLimitRPS = HardRateLimitCeiling
	}
	if s.MaxDuration <= 0 {
		s.MaxDuration = 5 * time.Minute
	}
	if s.MaxDuration > HardDurationCeiling {
		s.MaxDuration = HardDurationCeiling
	}
	if s.SeverityThreshold == "" {
		s.SeverityThreshold = SevInfo
	}
	return nil
}

// BuildTarget parses an engine.HTTPRequest into a Target with derived host
// + origin.
func BuildTarget(req engine.HTTPRequest) (Target, error) {
	u, err := url.Parse(req.URL)
	if err != nil {
		return Target{}, fmt.Errorf("invalid url: %w", err)
	}
	if u.Host == "" {
		return Target{}, fmt.Errorf("url missing host")
	}
	origin := u.Scheme + "://" + u.Host
	host := u.Hostname()
	return Target{
		BaseRequest: req,
		Host:        host,
		Origin:      origin,
	}, nil
}

func newScanID() string {
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

// SeverityCounts buckets a slice of findings by severity for the summary.
func SeverityCounts(fs []*Finding) map[Severity]int {
	out := map[Severity]int{
		SevCritical: 0, SevHigh: 0, SevMedium: 0, SevLow: 0, SevInfo: 0,
	}
	for _, f := range fs {
		out[f.Severity]++
	}
	return out
}

// CategorySet returns the unique categories that produced findings.
func CategorySet(fs []*Finding) []string {
	seen := map[Category]bool{}
	for _, f := range fs {
		seen[f.Category] = true
	}
	out := make([]string, 0, len(seen))
	for c := range seen {
		out = append(out, string(c))
	}
	return out
}

// CleanHostFromURL is a small utility used by handlers to derive the host
// shown in confirm-modal copy etc.
func CleanHostFromURL(rawURL string) string {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Host == "" {
		return ""
	}
	return u.Hostname()
}
