package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"

	"github.com/choicetechlab/choicehammer/internal/activity"
	"github.com/choicetechlab/choicehammer/internal/api"
	"github.com/choicetechlab/choicehammer/internal/config"
	"github.com/choicetechlab/choicehammer/internal/engine"
	"github.com/choicetechlab/choicehammer/internal/logger"
	"github.com/choicetechlab/choicehammer/internal/protocols"
	"github.com/choicetechlab/choicehammer/internal/storage"
	"github.com/choicetechlab/choicehammer/internal/teams"
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

	mgr := engine.NewManager(db.Pool, func(c *engine.TestConfig) (engine.Executor, error) {
		ex, err := protocols.New(c)
		if err != nil {
			return nil, err
		}
		return ex, nil
	})

	r := api.New(cfg, db.Pool, mgr, teamSvc, activitySvc)

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
