# ChoiceHammer — Backend

Go service with two binaries: an API/engine server and a `hammer` CLI.

## Run locally

```bash
# Postgres in Docker (only the db service)
docker compose up -d postgres

# Backend
cd backend
go mod tidy
go run ./cmd/server

# CLI
go build -o ../bin/hammer ./cmd/hammer
../bin/hammer --help
```

Reads config from env vars (see `internal/config/config.go`). Defaults assume the Docker Postgres on `localhost:5432` with creds `choicehammer/choicehammer`.

## Layout

```
backend/
├── cmd/
│   ├── server/           # HTTP API + engine
│   └── hammer/           # CLI: hammer run --curl … --by … --jira CT-123
├── internal/
│   ├── engine/           # Runner, VU, Scheduler, Batcher, Pool, Manager
│   ├── protocols/        # http.go, websocket.go (each implements engine.Executor)
│   ├── metrics/          # HDR histogram, Collector, snapshots
│   ├── curl/             # `curl …` → engine.HTTPRequest
│   ├── report/           # HTML template + gofpdf PDF + sparkline SVG
│   ├── api/
│   │   ├── router.go
│   │   ├── handlers/     # auth, tests, runs, live (SSE), reports, environments
│   │   └── middleware/   # KeyAuth, CORS, RequestLogger, Recovery
│   ├── storage/          # pgx pool + migrations/001_init.sql (applied on boot)
│   ├── logger/           # zap with daily-rotating file in /logs
│   └── config/
└── logs/                 # daily-rotating json log files (created at runtime)
```

## Engine flow

1. `engine.Manager.Start` inserts a `runs` row, builds a `Runner`, and returns a `ManagedRun`.
2. The `Runner` starts:
   - a `Scheduler` (computes desired VU count each 100 ms based on pattern),
   - a supervisor that ticks every 200 ms and spawns / cancels VU goroutines to match `Scheduler.Target()`,
   - a `Batcher` that drains the results channel and once per second flushes a `SecondBucket` via `OnBucket`.
3. Each VU runs a tight `Execute → record result → optional think-time → repeat` loop until its context is cancelled.
4. `Manager`'s `OnBucket` callback persists the bucket to `run_metrics` and broadcasts to all `LiveSubscriber`s.
5. On exit, the manager writes a final `summary` (totals + full series) into `runs.summary`.

## Concurrency rules

- Hot-path counters (`totalRequests`, `totalErrors`, …) are `atomic.Int64`, **not** mutex-protected.
- The HDR histogram is mutex-protected — only the batcher writes it, so contention is one writer.
- A semaphore (`Pool` = bounded `chan struct{}`) prevents the supervisor from over-spawning during ramp bursts.
- All goroutines are scoped to a `context.Context`. Cancelling the manager's run context drains everything cleanly.

## Logging

`internal/logger` builds a zap logger that tees to:
- `logs/choicehammer-YYYY-MM-DD.log` (JSON, lumberjack rotation, 100 MB / 30 backups / 90 days)
- stdout (colourised dev format)

A goroutine rotates the file at midnight local time. Use `logger.Info/Warn/Error/Debug` from anywhere — the package keeps a global `*zap.Logger`.

## Adding a new protocol

1. Implement `engine.Executor` (`Execute(ctx) Result`, `Close()`) in `internal/protocols/<name>.go`.
2. Wire it up in `protocols/protocol.go` (`New` switch).
3. The engine doesn't care what protocol you use — it only sees the `Result` (status, duration, bytes, error).

## Adding a CLI command

`cmd/hammer/main.go` uses `cobra`. Each command does an authenticated HTTP call to the server. Always pass `--by` and `--jira` for runs — the API rejects them otherwise.
