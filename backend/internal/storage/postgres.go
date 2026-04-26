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
		logger.Error("migration failed", zap.Error(err))
		return nil, fmt.Errorf("migrate: %w", err)
	}
	logger.Info("postgres migrations applied")

	return &DB{Pool: pool}, nil
}

func (d *DB) Close() {
	if d.Pool != nil {
		d.Pool.Close()
	}
}
