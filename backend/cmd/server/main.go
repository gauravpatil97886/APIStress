package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/choicetechlab/choicehammer/internal/platform/activity"
	"github.com/choicetechlab/choicehammer/internal/platform/api"
	"github.com/choicetechlab/choicehammer/internal/platform/handlers"
	"github.com/choicetechlab/choicehammer/internal/platform/config"
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/engine"
	"github.com/choicetechlab/choicehammer/internal/platform/jira"
	"github.com/choicetechlab/choicehammer/internal/tools/kavach"
	"github.com/choicetechlab/choicehammer/internal/platform/logger"
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/metrics"
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/protocols"
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/report"
	"github.com/choicetechlab/choicehammer/internal/platform/storage"
	"github.com/choicetechlab/choicehammer/internal/platform/teams"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		_, _ = os.Stderr.WriteString("config error: " + err.Error() + "\n")
		os.Exit(1)
	}

	if _, err := logger.Init(logger.Options{
		Dir:    cfg.LogDir,
		Level:  cfg.LogLevel,
		Pretty: cfg.LogPretty,
	}); err != nil {
		_, _ = os.Stderr.WriteString("logger init error: " + err.Error() + "\n")
		os.Exit(1)
	}
	defer logger.Sync()

	logger.Info("APIStress starting",
		zap.String("addr", cfg.HTTPAddr),
		zap.String("log_dir", cfg.LogDir),
		zap.Int("max_vus", cfg.MaxVUs),
	)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := storage.Open(ctx, cfg.PostgresDSN)
	if err != nil {
		logger.Fatal("postgres open failed", zap.Error(err))
	}
	defer db.Close()

	// Teams service: validates access keys, manages teams + admin actions.
	teamSvc := teams.New(db.Pool)
	if err := teamSvc.Bootstrap(ctx, cfg.AccessKey); err != nil {
		logger.Fatal("teams bootstrap failed", zap.Error(err))
	}
	logger.Info("teams bootstrap done — Legacy team ready")

	activitySvc := activity.New(db.Pool)

	// Optional Jira integration. nil + ok=false when env vars aren't set —
	// the API exposes /api/jira/health → {configured:false} so the UI hides
	// its "Attach to Jira" button gracefully.
	jiraClient, jiraOK := jira.New(cfg.JiraBaseURL, cfg.JiraAuthKind, cfg.JiraEmail, cfg.JiraAPIToken, cfg.JiraProjectKey)
	if jiraOK {
		logger.Info("jira integration configured",
			zap.String("base_url", cfg.JiraBaseURL),
			zap.String("auth_kind", cfg.JiraAuthKind),
			zap.String("project", cfg.JiraProjectKey),
		)
	} else {
		logger.Info("jira integration disabled — set CH_JIRA_BASE_URL + CH_JIRA_API_TOKEN to enable")
	}

	mgr := engine.NewManager(db.Pool, func(c *engine.TestConfig) (engine.Executor, error) {
		ex, err := protocols.New(c)
		if err != nil {
			return nil, err
		}
		return ex, nil
	})

	// Auto-attach hook: when a run finishes and the operator ticked
	// "auto-attach report to Jira", call the Jira API to upload the PDF.
	// Failures are logged + emitted to activity_log as `feature.jira.error`
	// so the admin's "Jira errors" panel can surface them.
	if jiraOK {
		mgr.SetFinishHook(func(ctx context.Context, mr *engine.ManagedRun) {
			if !mr.Meta.AutoAttachJira || strings.TrimSpace(mr.Meta.JiraID) == "" {
				return
			}
			autoAttachOnFinish(ctx, mr, db.Pool, jiraClient, activitySvc)
		})
	}

	kavachMgr := kavach.NewManager(db.Pool)
	r := api.New(cfg, db.Pool, mgr, teamSvc, activitySvc, jiraClient, kavachMgr)

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		logger.Info("HTTP server listening", zap.String("addr", cfg.HTTPAddr))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal("server failed", zap.Error(err))
		}
	}()

	<-ctx.Done()
	logger.Info("shutdown signal received")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", zap.Error(err))
	}
	logger.Info("APIStress stopped cleanly")
}

// autoAttachOnFinish is invoked once a run reaches a terminal state if the
// operator ticked "auto-attach report to Jira" on the test builder. We do
// the same work the manual /api/runs/:id/attach-jira handler does, except
// the run context (created_by, jira_id, summary, etc.) is read from the DB
// rather than the HTTP request, and any failure is recorded in
// activity_log as `feature.jira.error` so the admin panel can surface it.
func autoAttachOnFinish(ctx context.Context, mr *engine.ManagedRun, pool *pgxpool.Pool, j *jira.Client, act *activity.Service) {
	jiraID := strings.TrimSpace(mr.Meta.JiraID)
	if jiraID == "" || j == nil {
		return
	}

	logFail := func(reason string, err error) {
		logger.Warn("auto-attach failed",
			zap.String("run_id", mr.ID), zap.String("jira_id", jiraID),
			zap.String("reason", reason), zap.Error(err))
		if act == nil {
			return
		}
		act.Log(ctx, activity.Event{
			TeamID:       mr.TeamID,
			ActorType:    "system",
			ActorName:    mr.Meta.CreatedBy,
			EventType:    "feature.jira.error",
			ToolSlug:     "apistress",
			ResourceType: "run",
			ResourceID:   mr.ID,
			Meta: map[string]interface{}{
				"jira_id":  jiraID,
				"reason":   reason,
				"error":    fmt.Sprintf("%v", err),
				"phase":    "auto_attach_on_finish",
			},
		})
	}

	// Re-read finalized row so the Summary blob includes the run results.
	row := pool.QueryRow(ctx, `
		SELECT id, name, status, started_at, finished_at, summary, config,
		       created_by, jira_link, notes, env_tag
		  FROM runs WHERE id=$1`, mr.ID)
	var rid, name, status, createdBy, jiraLink, notes, envTag string
	var started, finished *time.Time
	var summaryRaw, cfgRaw []byte
	if err := row.Scan(&rid, &name, &status, &started, &finished, &summaryRaw, &cfgRaw,
		&createdBy, &jiraLink, &notes, &envTag); err != nil {
		logFail("db_read", err)
		return
	}

	issue, err := j.GetIssue(ctx, jiraID)
	if err != nil {
		logFail("issue_lookup", err)
		return
	}

	var cfg engine.TestConfig
	_ = json.Unmarshal(cfgRaw, &cfg)
	var summary *engine.Summary
	if len(summaryRaw) > 0 {
		var s engine.Summary
		if json.Unmarshal(summaryRaw, &s) == nil {
			summary = &s
		}
	}
	var series []metrics.SecondBucket
	if summary != nil {
		series = summary.Series
	}

	pdf, err := report.RenderPDFFromDataWithOptions(report.ReportData{
		ID: rid, Name: name, Status: status, Config: cfg,
		Summary: summary, StartedAt: started, FinishedAt: finished,
		CreatedBy: createdBy, JiraID: jiraID, JiraLink: jiraLink,
		Notes: notes, EnvTag: envTag, Series: series,
	}, report.PDFOptions{Orientation: "portrait", IncludeCharts: true})
	if err != nil {
		logFail("pdf_render", err)
		return
	}

	jiraURL := j.BaseURL + "/browse/" + jiraID
	filename := fmt.Sprintf("apistress-%s-%s.pdf", strings.ReplaceAll(name, " ", "_"), rid[:8])
	if err := j.Attach(ctx, jiraID, filename, pdf, "application/pdf"); err != nil {
		logFail("attach", err)
		return
	}
	commentBody := handlers.BuildJiraSummaryComment(name, status, createdBy, envTag, summary, issue, jiraURL, filename)
	if err := j.Comment(ctx, jiraID, commentBody); err != nil {
		// Comment failure is non-fatal — the PDF is already up.
		logger.Warn("auto-attach comment failed (attach succeeded)",
			zap.String("run_id", rid), zap.Error(err))
	}

	// Persist + audit success.
	var teamArg interface{}
	if mr.TeamID != "" {
		teamArg = mr.TeamID
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO jira_attachments (run_id, team_id, jira_id, jira_url, filename, bytes, attached_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		rid, teamArg, jiraID, jiraURL, filename, len(pdf), createdBy,
	); err != nil {
		logger.Warn("jira_attachments insert failed (auto)", zap.Error(err))
	}
	if act != nil {
		act.Log(ctx, activity.Event{
			TeamID: mr.TeamID, ActorType: "system", ActorName: createdBy,
			EventType: "feature.jira.attach", ToolSlug: "apistress",
			ResourceType: "run", ResourceID: rid,
			Meta: map[string]interface{}{
				"jira_id": jiraID, "filename": filename, "bytes": len(pdf), "auto": true,
			},
		})
	}
	logger.Info("auto-attach succeeded",
		zap.String("run_id", rid), zap.String("jira_id", jiraID), zap.String("filename", filename))
}
