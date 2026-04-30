# Choice Techlab — Backend

Go service with two binaries: an API/engine server and a `hammer` CLI. Module path: `github.com/choicetechlab/choicehammer`.

Hosts **APIStress** (load testing) + **PostWomen** (API client) + **Kavach** (API VAPT) endpoints, plus a shared team-scoped auth/admin layer, an activity feed, and a Jira integration. (Crosswalk is frontend-only.)

## Run locally

```bash
docker compose up -d postgres                  # postgres on :5434

cd backend
go mod tidy
go run ./cmd/server                            # API + engine on :8080

go build -o ../bin/hammer ./cmd/hammer         # CLI
../bin/hammer --help
```

Reads config from env vars (see `internal/platform/config/config.go`).

Important env vars:
- `CH_HTTP_ADDR`        — listen address (default `:8080`)
- `CH_POSTGRES_DSN`     — Postgres URL
- `CH_ACCESS_KEY`       — seed key for the auto-created **Legacy** team
- `CH_ADMIN_KEY`        — gate for `/api/admin/*` (default `97886` in dev)
- `CH_LOG_DIR` / `CH_LOG_LEVEL` / `CH_LOG_PRETTY`
- `CH_MAX_VUS`
- **Jira**: `CH_JIRA_BASE_URL`, `CH_JIRA_AUTH_KIND` (`cloud_basic` | `server_pat`), `CH_JIRA_EMAIL` (Cloud only), `CH_JIRA_API_TOKEN`, `CH_JIRA_PROJECT_KEY`
   - Cloud: `CH_JIRA_AUTH_KIND=cloud_basic` + email + API token; backend sends `Basic base64(email:token)`.
   - Server / Data Center: `CH_JIRA_AUTH_KIND=server_pat` + PAT only; backend sends `Bearer <pat>`.
   - Leave any blank → integration disables itself; `/api/jira/health` returns `{configured:false}`.

## Layout — platform vs tools

```
backend/
├── cmd/
│   ├── server/                      # HTTP API + engine + bootstrap teams + auto-attach hook
│   └── hammer/                      # CLI: hammer run --curl … --by … --jira CT-123
└── internal/
    ├── platform/                    # SHARED — used by every tool
    │   ├── activity/                # cross-tool event sink (Log, List, Stats)
    │   ├── api/
    │   │   ├── router.go            # gin.Engine factory; wires every handler
    │   │   └── middleware/          # TeamAuth, KeyAuth, CORS, RequestLogger, Recovery
    │   ├── config/                  # env-driven config
    │   ├── curl/                    # curl-string parser used by every tool
    │   ├── handlers/                # cross-tool handlers
    │   │   ├── auth.go              # /api/auth/login, /api/auth/verify
    │   │   ├── activity.go          # frontend-emitted activity events
    │   │   ├── jira.go              # /api/jira/health, /api/jira/issue/:key, run attaches
    │   │   ├── util.go              # tiny helpers (newID, …)
    │   │   └── admin/               # /api/admin/* — teams, audit, activity, jira
    │   ├── jira/                    # Jira REST client (Health, GetIssue, Attach, Comment)
    │   ├── logger/                  # zap with daily-rotating file in logs/
    │   ├── storage/                 # pgx pool + embedded migrations
    │   ├── teams/                   # multi-tenant team service + bcrypt + audit
    │   └── tools/                   # canonical AllSlugs registry
    └── tools/                       # PER-TOOL — one folder per product
        ├── apistress/
        │   ├── engine/              # Runner, Manager, Scheduler, Batcher, Pool, VU
        │   ├── metrics/             # HDR histogram, Collector, snapshots
        │   ├── protocols/           # http.go, websocket.go (impl engine.Executor)
        │   ├── cost/                # AWS-style cost calculator
        │   ├── report/              # HTML template + gofpdf PDF + sparkline
        │   └── handlers/            # tests, runs, live (SSE), reports, compare, cost, environments, util
        ├── postwomen/
        │   ├── store/               # workspace/collection/request models + Postman import/export + Send()
        │   └── handlers/            # /api/postwomen/* routes
        └── kavach/                  # API VAPT
            ├── *.go                 # types, engine, runner, safety, catalog, explanations, test_*.go, report, persistence (single package)
            └── handlers/            # /api/kavach/* + SSE
```

Migrations (numbered, idempotent, applied in order on boot — under `internal/platform/storage/migrations/`):
- `001_init.sql` — engine + reports core schema.
- `002_postwomen.sql` — PostWomen workspaces / collections / requests / history.
- `003_teams.sql` — teams, team_keys, team_members, admin_audit + `team_id` on every user-data table.
- `004_activity.sql` — `activity_log` with team / event / tool / ts indexes.
- `005_jira.sql` — `jira_attachments` paper-trail.
- `006_vapt.sql` — Kavach scans, findings, run-state.
- `007_vapt_jira.sql` — per-finding Jira link table.
- `008_vapt_explanation.sql` — plain-English fields on findings.

## Tool isolation rules (the big one)

- **Tools may import from `platform/`.** Always.
- **Platform may NEVER import from `tools/`.** If platform needs a type or helper, the type belongs in platform.
- **Tools may NOT import from sibling tools.** If two tools genuinely need the same code, lift it into `platform/`.

Allowed:
```go
import "github.com/choicetechlab/choicehammer/internal/platform/teams"        // tool → platform ✓
import "github.com/choicetechlab/choicehammer/internal/tools/apistress/cost"  // same tool ✓
```

Forbidden:
```go
import "github.com/choicetechlab/choicehammer/internal/tools/postwomen/store" // from inside kavach ✗
import "github.com/choicetechlab/choicehammer/internal/tools/apistress/engine"// from inside platform ✗
```

(There is one exception today: `internal/platform/api/router.go` imports the per-tool `handlers` packages to wire routes. That is the seam, not a leak — the router lives in platform precisely because it is the wiring layer.)

## Engine flow (APIStress)

1. `engine.Manager.Start(ctx, cfg, testID, meta, teamID)` inserts a `runs` row (with `team_id`), builds a `Runner`, returns a `ManagedRun` (carries `TeamID`).
2. The `Runner` starts:
   - a `Scheduler` (computes desired VU count each 100 ms based on pattern),
   - a supervisor that ticks every 200 ms and spawns / cancels VU goroutines,
   - a `Batcher` that drains the results channel and once per second flushes a `SecondBucket` via `OnBucket`.
3. Each VU runs a tight `Execute → record result → optional think-time → repeat` loop until cancelled.
4. `Manager.OnBucket` persists the bucket to `run_metrics` and broadcasts to all `LiveSubscriber`s.
5. On exit, the manager writes a final `summary` (totals + full series) into `runs.summary`.

## Concurrency rules

- Hot-path counters (`totalRequests`, `totalErrors`, …) are `atomic.Int64`, **not** mutex-protected.
- The HDR histogram is mutex-protected — only the batcher writes it, so contention is one writer.
- A semaphore (`Pool` = bounded `chan struct{}`) prevents the supervisor from over-spawning during ramp bursts.
- All goroutines are scoped to a `context.Context`. Cancelling the manager's run context drains everything cleanly.

## Multi-tenancy & isolation

- Migration `003_teams.sql` adds `teams`, `team_keys`, `team_members`, `admin_audit`, plus `team_id UUID` columns on every user-data table.
- On boot, `teams.Service.Bootstrap(ctx, CH_ACCESS_KEY)` ensures a **Legacy** team exists, backfills every NULL `team_id` to Legacy, and seeds Legacy with a key matching `CH_ACCESS_KEY`. Idempotent.
- `middleware.TeamAuth(svc)` runs on every `/api/...` route in the `protected` group. It bcrypt-checks the key (header `X-Access-Key` / `Authorization: Bearer …` / `?key=`), enforces `is_active`, and sets `team_id`/`team_name` in the gin context.
- Handlers read `team := middleware.TeamID(c)` and **MUST** include `WHERE team_id=$N` in every read/write query against user-data tables.
- The SSE live endpoints use `TeamAuth` too (with `?key=` extraction), and reject subscriptions when the run's team_id doesn't match the caller's team.

## Adding a new endpoint

1. If it touches user data, put it inside the `protected` group:
   ```go
   protected.POST("/foo/bar", handler.Bar)
   ```
2. In the handler, **always**:
   ```go
   teamID := middleware.TeamID(c)
   // ... and filter by team_id in every query.
   ```
3. If the handler should emit an activity event, call `actSvc.Log(ctx, activity.Event{...})`. Best-effort, never blocks.

## Adding a new protocol (APIStress)

1. Implement `engine.Executor` (`Execute(ctx) Result`, `Close()`) in `internal/tools/apistress/protocols/<name>.go`.
2. Wire it up in `protocols/protocol.go` (`New` switch).
3. The engine doesn't care what protocol you use — it only sees the `Result` (status, duration, bytes, error).

## Adding a CLI command

`cmd/hammer/main.go` uses `cobra`. Each command does an authenticated HTTP call to the server. Always pass `--by` and `--jira` for runs — the API rejects them otherwise.

## Logging

`internal/platform/logger` builds a zap logger that tees to:
- `logs/choicehammer-YYYY-MM-DD.log` (JSON, lumberjack rotation, 100 MB / 30 backups / 90 days)
- stdout (colourised dev format)

A goroutine rotates the file at midnight local time. Use `logger.Info/Warn/Error/Debug` from anywhere — the package keeps a global `*zap.Logger`.

## Docker

`backend/Dockerfile` is a multi-stage build with BuildKit cache mounts, runs as non-root, ships a `wget`-based `/healthz` HEALTHCHECK, and emits a stripped static binary (`-trimpath -ldflags="-s -w"`).
