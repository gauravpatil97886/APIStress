# APIStress

> Hit your APIs hard. Know exactly what breaks.

Open-source load-testing tool. Go (Gin) backend, React 18 frontend, PostgreSQL for storage, optional `hammer` CLI.

## Repo layout

```
choicehammer/
├── backend/          # Go service (engine + API + CLI)
├── frontend/         # React 18 + Vite + Tailwind dashboard
├── docker-compose.yml
├── Makefile
├── .env              # local dev env (dummy creds, safe to commit *for this internal tool*)
└── .env.example
```

Each side has its own `CLAUDE.md` with deeper context.

## Quick start

```bash
# 1. Postgres + backend + frontend, all in Docker
docker compose up --build

# 2. Open http://localhost:5173
#    Access key (default):  choicehammer-dev-key

# 3. Or run pieces locally:
make backend     # backend on :8080
make frontend    # frontend on :5173
make cli         # builds ./bin/hammer
```

## Architecture in 60 seconds

- **Engine** (`backend/internal/engine`): a `Runner` orchestrates a goroutine pool of virtual users that hammer a target. A `Scheduler` computes the desired VU count over time (constant / ramp / spike / stages). A `Batcher` drains per-request results, feeds an HDR-histogram-backed `Collector`, and emits a `SecondBucket` once per second.
- **Persistence**: Postgres stores tests, runs, per-second metric snapshots, environments. Schema lives in `backend/internal/storage/migrations/001_init.sql` and is applied on boot.
- **Live metrics**: The API exposes SSE at `/api/runs/:id/live`. The frontend's `useLiveMetrics` hook subscribes via `EventSource`.
- **Auth**: Single shared access key. The frontend posts the key to `/api/auth/login`; on success it stores the key in `localStorage` and sends it as `X-Access-Key` on every request. SSE uses the `?key=` query param so EventSource works.
- **Reports**: HTML rendered from a Go `html/template`, PDF generated server-side with `gofpdf` (no headless Chrome needed). Both include the operator's name and Jira link.
- **Logging**: zap logger with daily file rotation in `backend/logs/choicehammer-YYYY-MM-DD.log` plus a colourised stdout stream. Every component (engine, manager, storage, http) logs structured events.

## Required attribution on every run

Every run captures `created_by`, `jira_id`, and `jira_link`. The frontend forces these in the test builder; the API rejects starts without them. They appear at the top of every PDF/HTML report so reviewers can trace any run back to a person and a ticket.

## Conventions

- **Time**: per-second buckets are the unit of truth for charts. Internally we record latency in **microseconds** (HDR histogram), display in **milliseconds**.
- **Backwards compat**: this is an internal tool. Break schemas freely; bump `001_init.sql` or add `002_*.sql` and rebuild.
- **Tests**: not yet present. When adding, prefer integration tests against a real Postgres in Docker.
