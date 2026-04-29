# Choice Techlab — Backend

Go service with two binaries: an API/engine server and a `hammer` CLI. Powers both APIStress (load testing) and PostWomen (API client), behind shared team-scoped auth.

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

Reads config from env vars (see `internal/config/config.go`). Defaults assume the Docker Postgres on `localhost:5432` (or `:5434` in compose) with creds `choicehammer/choicehammer`.

Important env vars:
- `CH_HTTP_ADDR`        — listen address (default `:8080`)
- `CH_POSTGRES_DSN`     — Postgres URL
- `CH_ACCESS_KEY`       — seed key for the auto-created **Legacy** team
- `CH_ADMIN_KEY`        — gate for `/api/admin/*` (default `97886` in dev)
- `CH_LOG_DIR` / `CH_LOG_LEVEL` / `CH_LOG_PRETTY`
- `CH_MAX_VUS`

## Layout

```
backend/
├── cmd/
│   ├── server/           # HTTP API + engine + bootstrap teams
│   └── hammer/           # CLI: hammer run --curl … --by … --jira CT-123
├── internal/
│   ├── engine/           # Runner, VU, Scheduler, Batcher, Pool, Manager
│   ├── protocols/        # http.go, websocket.go (each implements engine.Executor)
│   ├── metrics/          # HDR histogram, Collector, snapshots
│   ├── curl/             # `curl …` → engine.HTTPRequest
│   ├── report/           # HTML template + gofpdf PDF + sparkline SVG
│   ├── teams/            # Team + key persistence, bcrypt auth, admin ops, audit
│   ├── postwomen/        # PostWomen models + Postman import/export + Send()
│   ├── api/
│   │   ├── router.go
│   │   ├── handlers/     # auth, tests, runs, live (SSE), reports, environments,
│   │   │                 # compare, cost, postwomen/, admin/
│   │   └── middleware/   # TeamAuth, KeyAuth (legacy), CORS, RequestLogger, Recovery
│   ├── storage/          # pgx pool + migrations 001..003 (applied on boot, in order)
│   ├── logger/           # zap with daily-rotating file in /logs
│   └── config/
└── logs/                 # daily-rotating json log files (created at runtime)
```

## Engine flow

1. `engine.Manager.Start(ctx, cfg, testID, meta, teamID)` inserts a `runs` row (with `team_id`), builds a `Runner`, and returns a `ManagedRun` (which carries `TeamID`).
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

## Multi-tenancy & isolation

- Migration `003_teams.sql` adds `teams`, `team_keys`, `team_members`, `admin_audit`, plus `team_id UUID` columns on `runs`, `tests`, `environments`, `pw_workspaces`, `pw_history`.
- On boot, `teams.Service.Bootstrap(ctx, CH_ACCESS_KEY)` ensures a **Legacy** team exists, backfills every NULL `team_id` to Legacy, and seeds Legacy with a key matching `CH_ACCESS_KEY`. Idempotent.
- `middleware.TeamAuth(svc)` runs on every `/api/...` route in the `protected` group. It bcrypt-checks the key (header `X-Access-Key` / `Authorization: Bearer …` / `?key=`), enforces `is_active`, and sets `team_id`/`team_name` in the gin context.
- Handlers read `team := middleware.TeamID(c)` and **MUST** include `WHERE team_id=$N` in every read/write query against user-data tables. PostWomen collections/requests check ownership transitively via their workspace.
- The SSE live endpoint uses `TeamAuth` too (with `?key=` extraction), and `live.go` rejects subscriptions when `mr.TeamID` doesn't match the caller's team.
- Adding a new handler? If it touches user data, put it inside `protected := r.Group("/api", middleware.TeamAuth(teamSvc))` and filter by team.

## Admin

`/api/admin/*` is a separate auth scope using `CH_ADMIN_KEY` (header `X-Admin-Key`). Endpoints: list/create/rename/delete/disable teams, rotate keys, set `tools_access`, view `admin_audit`. The plaintext key is shown to the admin **once** at create/rotate time; only the bcrypt hash is stored. Every mutation is audited.

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

## Docker

`backend/Dockerfile` is a multi-stage build with BuildKit cache mounts, runs as non-root, ships a `wget`-based `/healthz` HEALTHCHECK, and emits a stripped static binary (`-trimpath -ldflags="-s -w"`). Build context is trimmed by `.dockerignore`.
