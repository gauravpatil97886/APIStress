package storage

import (
	"context"
	_ "embed"
	"fmt"
	"time"

	"github.com/choicetechlab/choicehammer/internal/logger"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

//go:embed migrations/001_init.sql
var initSQL string

//go:embed migrations/002_postwomen.sql
var postwomenSQL string

//go:embed migrations/003_teams.sql
var teamsSQL string

//go:embed migrations/004_activity.sql
var activitySQL string

//go:embed migrations/005_jira.sql
var jiraSQL string

//go:embed migrations/006_vapt.sql
var vaptSQL string

//go:embed migrations/007_vapt_jira.sql
var vaptJiraSQL string

//go:embed migrations/008_vapt_explanation.sql
var vaptExpSQL string

type DB struct {
	Pool *pgxpool.Pool
}

func Open(ctx context.Context, dsn string) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse dsn: %w", err)
	}
	cfg.MaxConns = 20
	cfg.MinConns = 2
	cfg.MaxConnLifetime = time.Hour

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		logger.Error("postgres connect failed", zap.Error(err))
		return nil, fmt.Errorf("connect: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		logger.Error("postgres ping failed", zap.Error(err))
		return nil, fmt.Errorf("ping: %w", err)
	}
	logger.Info("postgres connected",
		zap.Int32("max_conns", cfg.MaxConns),
		zap.Int32("min_conns", cfg.MinConns),
	)

	if _, err := pool.Exec(ctx, initSQL); err != nil {
		pool.Close()
		logger.Error("migration 001 failed", zap.Error(err))
		return nil, fmt.Errorf("migrate 001: %w", err)
	}
	if _, err := pool.Exec(ctx, postwomenSQL); err != nil {
		pool.Close()
		logger.Error("migration 002 failed", zap.Error(err))
		return nil, fmt.Errorf("migrate 002: %w", err)
	}
	if _, err := pool.Exec(ctx, teamsSQL); err != nil {
		pool.Close()
		logger.Error("migration 003 failed", zap.Error(err))
		return nil, fmt.Errorf("migrate 003: %w", err)
	}
	if _, err := pool.Exec(ctx, activitySQL); err != nil {
		pool.Close()
		logger.Error("migration 004 failed", zap.Error(err))
		return nil, fmt.Errorf("migrate 004: %w", err)
	}
	if _, err := pool.Exec(ctx, jiraSQL); err != nil {
		pool.Close()
		logger.Error("migration 005 failed", zap.Error(err))
		return nil, fmt.Errorf("migrate 005: %w", err)
	}
	if _, err := pool.Exec(ctx, vaptSQL); err != nil {
		pool.Close()
		logger.Error("migration 006 failed", zap.Error(err))
		return nil, fmt.Errorf("migrate 006: %w", err)
	}
	if _, err := pool.Exec(ctx, vaptJiraSQL); err != nil {
		pool.Close()
		logger.Error("migration 007 failed", zap.Error(err))
		return nil, fmt.Errorf("migrate 007: %w", err)
	}
	if _, err := pool.Exec(ctx, vaptExpSQL); err != nil {
		pool.Close()
		logger.Error("migration 008 failed", zap.Error(err))
		return nil, fmt.Errorf("migrate 008: %w", err)
	}
	logger.Info("postgres migrations applied")

	return &DB{Pool: pool}, nil
}

func (d *DB) Close() {
	if d.Pool != nil {
		d.Pool.Close()
	}
}
