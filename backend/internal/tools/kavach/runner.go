package kavach

import (
	"context"
	"crypto/tls"
	"net/http"
	"sync"
	"time"

	"github.com/choicetechlab/choicehammer/internal/platform/logger"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
	"golang.org/x/time/rate"
)

// runScan is the per-scan goroutine. Looks up the test catalogue filtered
// by enabled categories, fans them out across a worker pool with a shared
// token-bucket rate limiter, persists each finding, and broadcasts events
// to subscribers.
//
// Failure mode: any individual test panic is recovered + logged as a
// "test crashed" finding; the scan as a whole continues. The only thing
// that aborts the scan is `ctx.Done()` (operator stop or duration ceiling).
func runScan(ctx context.Context, pool *pgxpool.Pool, scan *Scan) {
	startedAt := time.Now()

	// Collect enabled tests. We snapshot the catalogue here so a hot-reload
	// of a test plugin (future) wouldn't midflight-mutate the run.
	enabled := make(map[Category]bool, len(scan.Settings.EnabledCategories))
	for _, c := range scan.Settings.EnabledCategories {
		enabled[c] = true
	}
	tests := make([]Test, 0, len(Catalog))
	for _, t := range Catalog {
		if enabled[t.Category()] {
			tests = append(tests, t)
		}
	}

	totalTests := len(tests)
	if totalTests == 0 {
		finalize(ctx, pool, scan, "completed", startedAt)
		return
	}

	// Shared rate limiter — keeps total outbound rps across all workers
	// under the operator-chosen ceiling.
	rl := rate.NewLimiter(rate.Limit(scan.Settings.RateLimitRPS), scan.Settings.RateLimitRPS)

	// HTTP client used by every test. Insecure-skip-verify is intentional —
	// the operator may be scanning a staging endpoint with a self-signed
	// cert. We don't follow redirects so the test sees the literal status
	// of the endpoint it asked for.
	httpClient := &http.Client{
		Timeout: 15 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig:   &tls.Config{InsecureSkipVerify: true},
			DisableKeepAlives: false,
			MaxIdleConns:      32,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	// Worker pool — capped concurrency keeps a slow target from being
	// hammered while still letting independent tests run in parallel.
	concurrency := 4
	if scan.Settings.RateLimitRPS > 10 {
		concurrency = 8
	}
	workCh := make(chan Test, len(tests))
	for _, t := range tests {
		workCh <- t
	}
	close(workCh)

	var (
		mu               sync.Mutex
		done             int
		categoryDone     = map[Category]int{}
		// Per-test pass/fail tracking. A test that returned 0 findings is
		// recorded as "passed" — gives the operator visibility into
		// every check that ran, not just the ones that flagged something.
		testResults      = make([]TestResult, 0, len(tests))
		passedByCat      = map[Category]int{}
		failedByCat      = map[Category]int{}
	)

	// Snapshot event so the SSE handler can render initial state immediately
	// after subscribe. (Mirrors metrics.BuildLiveSnapshot's role on the
	// load-test side.)
	scan.broadcast(Event{
		Kind:   "snapshot",
		ScanID: scan.ID,
		Status: "running",
		Progress: &ProgressFrame{Done: 0, Total: totalTests, Counts: SeverityCounts(scan.Findings), Pct: 0},
	})

	wg := sync.WaitGroup{}
	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for t := range workCh {
				if ctx.Err() != nil {
					return
				}
				_ = rl.Wait(ctx)
				if ctx.Err() != nil {
					return
				}
				testStart := time.Now()
				findings := safeRun(ctx, t, scan.Target, httpClient)
				testDur := time.Since(testStart)

				kept := 0
				for i := range findings {
					f := &findings[i]
					if !Meets(f.Severity, scan.Settings.SeverityThreshold) {
						continue
					}
					f.Ts = time.Now()
					if f.TestExplanation == "" {
						f.TestExplanation = ExplainTest(f.TestID)
					}
					id, err := InsertFinding(ctx, pool, scan.ID, scan.TeamID, f)
					if err != nil {
						logger.Warn("vapt finding insert failed",
							zap.String("scan_id", scan.ID),
							zap.String("test_id", t.ID()),
							zap.Error(err))
						continue
					}
					f.ID = id
					kept++
					mu.Lock()
					scan.Findings = append(scan.Findings, f)
					mu.Unlock()
					scan.broadcast(Event{Kind: "finding", ScanID: scan.ID, Finding: f})
				}

				// Record per-test pass/fail. A test that flagged zero
				// findings is recorded as PASSED so the report shows the
				// full VAPT sweep, not just the failures.
				tr := TestResult{
					TestID:       t.ID(),
					Name:         t.Name(),
					Category:     t.Category(),
					Passed:       kept == 0,
					FindingCount: kept,
					DurationMs:   testDur.Milliseconds(),
				}

				mu.Lock()
				done++
				categoryDone[t.Category()]++
				testResults = append(testResults, tr)
				if tr.Passed {
					passedByCat[t.Category()]++
				} else {
					failedByCat[t.Category()]++
				}
				snap := &ProgressFrame{
					Done:     done,
					Total:    totalTests,
					Category: t.Category(),
					Counts:   SeverityCounts(scan.Findings),
					Pct:      pct(done, totalTests),
					Elapsed:  time.Since(startedAt).Milliseconds(),
				}
				mu.Unlock()
				scan.broadcast(Event{Kind: "progress", ScanID: scan.ID, Progress: snap})
				// Stream a per-test result so the live view can show "12 of 18 done · 8 passed · 4 issues".
				scan.broadcast(Event{Kind: "test", ScanID: scan.ID, Test: &tr})
			}
		}()
	}
	wg.Wait()

	// Hand the per-test result slice to the scan so finalize() can persist
	// it as part of the summary. Done under the scan mutex for safety.
	scan.mu.Lock()
	scan.TestResults = testResults
	scan.mu.Unlock()
	_ = passedByCat
	_ = failedByCat

	status := "completed"
	if ctx.Err() == context.Canceled {
		status = "stopped"
	} else if ctx.Err() == context.DeadlineExceeded {
		status = "completed"
	}
	finalize(ctx, pool, scan, status, startedAt)
}

// safeRun wraps a test invocation with a panic recovery so one bad test
// can't abort an entire scan. Also caps the per-test wall clock at 15s.
func safeRun(ctx context.Context, t Test, target Target, h *http.Client) (out []Finding) {
	defer func() {
		if r := recover(); r != nil {
			logger.Error("vapt test panicked",
				zap.String("test_id", t.ID()), zap.Any("panic", r))
		}
	}()
	tctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	return t.Run(tctx, target, h)
}

func finalize(ctx context.Context, pool *pgxpool.Pool, scan *Scan, status string, startedAt time.Time) {
	finishedAt := time.Now()
	scan.Status = status
	scan.FinishedAt = &finishedAt

	// Aggregate per-test results into pass/fail rollups.
	testsRun := len(scan.TestResults)
	passed := 0
	for _, tr := range scan.TestResults {
		if tr.Passed {
			passed++
		}
	}
	failed := testsRun - passed

	categoriesRun := []string{}
	seenCat := map[Category]bool{}
	for _, tr := range scan.TestResults {
		if !seenCat[tr.Category] {
			seenCat[tr.Category] = true
			categoriesRun = append(categoriesRun, string(tr.Category))
		}
	}

	summary := map[string]interface{}{
		"counts":          SeverityCounts(scan.Findings),
		"total_findings":  len(scan.Findings),
		"categories_run":  categoriesRun,
		"duration_ms":     finishedAt.Sub(startedAt).Milliseconds(),
		// Per-test visibility: every check that ran, whether it flagged
		// anything or not. Lets the report show "12 of 18 tests passed".
		"tests_run":     testsRun,
		"tests_passed":  passed,
		"tests_failed":  failed,
		"test_results":  scan.TestResults,
	}
	// Use a fresh bg context — `ctx` may be cancelled at this point.
	bg := context.Background()
	if err := FinalizeScan(bg, pool, scan.ID, status, summary, finishedAt); err != nil {
		logger.Warn("vapt finalize failed",
			zap.String("scan_id", scan.ID), zap.Error(err))
	}

	scan.broadcast(Event{
		Kind: "done", ScanID: scan.ID, Status: status, Summary: summary,
	})
	scan.closeSubs()

	logger.Info("vapt scan finished",
		zap.String("scan_id", scan.ID),
		zap.String("status", status),
		zap.Int("findings", len(scan.Findings)),
		zap.Int64("duration_ms", finishedAt.Sub(startedAt).Milliseconds()),
	)
}

func pct(done, total int) int {
	if total == 0 {
		return 100
	}
	return (done * 100) / total
}
