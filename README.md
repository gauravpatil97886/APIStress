# APIStress

> **Hit your APIs hard. Know exactly what breaks.**
>
> A modern, self-hosted load-testing tool with a beautiful dashboard, real-time charts, plain-English insights, run comparison, and shareable PDF reports. Free and open source.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Go](https://img.shields.io/badge/go-1.22+-00ADD8?logo=go)
![React](https://img.shields.io/badge/react-18-61DAFB?logo=react)
![Postgres](https://img.shields.io/badge/postgres-16-336791?logo=postgresql)

---

## Why APIStress?

Existing load-test tools either need a CLI/yaml workflow (`k6`, `gatling`) or a SaaS dashboard with per-test pricing. APIStress is a **single-binary backend + React frontend** you can self-host on a laptop or a small VM and run unlimited tests against your own services.

**It is designed for:** internal API teams, QA engineers, and SREs who want a one-click tool to validate that a deploy can take real traffic — and a sharable PDF/HTML report afterwards.

## Features

- **Key-only login** — paste a shared key, get in. No user accounts to manage.
- **Curl import** — paste any `curl …` command and it becomes a configured test.
- **Patterns**: constant load, ramp-up, spike, multi-stage.
- **HDR-histogram-backed metrics** — accurate p50/p75/p90/p95/p99/p999 latency, not averages.
- **Live SSE charts** — latency, throughput, active VUs, errors per second update every second.
- **Run any test from anywhere** — runs continue server-side if you navigate away or close the tab; a global notifier tells you when they finish.
- **Plain-English reports** — verdict banner ("Test Passed" / "Degraded" / "Failed"), executive summary, percentile breakdown table, status code donut, **insights & recommendations** ("p99 latency is 914ms — tail latency this high usually means GC pauses, lock contention, or queueing").
- **Beautiful PDF + HTML reports** with attribution: every report shows **who tested it** (name + initials avatar), the **Jira ticket** (clickable), the **environment** (`PRODUCTION` / `BROKING` / `UAT` pill), and timestamps.
- **History** with filters by status, user, and **environment tag** (Production / Broking-Preprod / UAT).
- **Run comparison** — pick any two finished runs and get a side-by-side diff with overlaid charts and per-metric green/red deltas. Catches regressions instantly.
- **Re-run** any past test with one click — pre-fills the builder.
- **Customisable PDF download** — name the file, pick orientation, optionally exclude charts.
- **CLI** (`hammer`) for terminal-loving folks and CI pipelines.
- **Daily-rotating zap logs** in `backend/logs/`.

## Screenshots

> _Add your screenshots to `docs/screenshots/` and update these paths after the first run._

| Live test | Report (HTML) | History |
|---|---|---|
| ![live](<img width="1919" height="931" alt="image" src="https://github.com/user-attachments/assets/cdb25334-a090-46d1-9b05-b12154aeb270" />
) | ![report](<img width="1919" height="931" alt="image" src="https://github.com/user-attachments/assets/1c6491e2-693b-4c76-a1bb-2eeabe36e3bd" />
) | ![history](<img width="1919" height="931" alt="image" src="https://github.com/user-attachments/assets/69c2edb0-4e71-4b8f-837c-d0fe8f5ded09" />
) |

---

## Quick start (Docker — recommended)

Prerequisites: **Docker** + **Docker Compose v2**.

### One-line install

```bash
git clone https://github.com/apistress/apistress.git && cd apistress && ./scripts/install.sh
```

The installer verifies Docker, copies `.env`, **generates a random access key**, builds the containers, waits for `/healthz`, and prints your URL + key when it's ready (~2 min cold).

### Manual

```bash
git clone https://github.com/apistress/apistress.git
cd apistress
cp .env.example .env       # edit CH_ACCESS_KEY before going to prod!
docker compose up --build
# or:
make up
```

Then open:

| Service  | URL                       |
|----------|---------------------------|
| Frontend | http://localhost:5173     |
| Backend  | http://localhost:8080     |
| Postgres | `localhost:5432`          |

Login key (default): `choicehammer-dev-key`

To stop:

```bash
docker compose down
```

To wipe DB volume too:

```bash
docker compose down -v
```

---

## Local development (no Docker for the app)

You still need Postgres — the easiest is to run only the DB in Docker:

```bash
docker run -d --name ch-postgres \
  -e POSTGRES_USER=choicehammer -e POSTGRES_PASSWORD=choicehammer -e POSTGRES_DB=choicehammer \
  -p 5432:5432 postgres:16-alpine
```

Backend:

```bash
cd backend
go mod tidy
CH_HTTP_ADDR=:8080 \
CH_POSTGRES_DSN='postgres://choicehammer:choicehammer@localhost:5432/choicehammer?sslmode=disable' \
CH_ACCESS_KEY='choicehammer-dev-key' \
go run ./cmd/server
```

Frontend (in another terminal):

```bash
cd frontend
npm install
VITE_API_URL=http://localhost:8080 npm run dev
```

Open http://localhost:5173.

CLI:

```bash
make cli                                 # builds ./bin/hammer
./bin/hammer --api http://localhost:8080 \
             --key choicehammer-dev-key \
             run --url https://httpbin.org/get --vus 20 --duration 30 \
             --by "Your Name" --jira CT-123
```

---

## Configuration

All knobs are env vars (see `.env.example`):

| Var                    | Default                                                                       | What it does |
|------------------------|-------------------------------------------------------------------------------|--------------|
| `CH_HTTP_ADDR`         | `:8080`                                                                       | What address the API binds to. |
| `CH_POSTGRES_DSN`      | `postgres://choicehammer:choicehammer@localhost:5432/choicehammer?sslmode=disable` | Postgres connection. |
| `CH_ACCESS_KEY`        | `choicehammer-dev-key`                                                        | **Change this in production.** Anyone with the key can use the tool. |
| `CH_LOG_DIR`           | `logs`                                                                        | Where daily-rotating log files go. |
| `CH_LOG_LEVEL`         | `info`                                                                        | `debug` / `info` / `warn` / `error`. |
| `CH_MAX_VUS`           | `50000`                                                                       | Hard upper bound on simultaneous virtual users (sanity cap). |
| `VITE_API_URL`         | `http://localhost:8080`                                                       | Where the frontend looks for the backend. |

---

## Architecture in 60 seconds

```
            ┌────────────────────────────┐
            │   React 18 (Vite + TW)     │  ← Tailwind, framer-motion, recharts
            │   key-only login           │
            └─────────────┬──────────────┘
                          │ REST + SSE (/api/*)
            ┌─────────────▼──────────────┐
            │   Go (Gin) API + Engine    │
            │ ┌────────────────────────┐ │
            │ │ Engine (runner / VU /  │ │
            │ │ scheduler / batcher /  │ │
            │ │ HDR histogram)         │ │
            │ └─────────┬──────────────┘ │
            │           │ pgx pool       │
            └───────────┼────────────────┘
                        ▼
                  ┌───────────┐
                  │ Postgres  │  runs, run_metrics, tests, environments
                  └───────────┘
```

- **`backend/internal/engine/`** — runner orchestrates a goroutine pool of virtual users; `Scheduler` computes target VU count over time; `Batcher` drains results and emits one `SecondBucket` per second.
- **`backend/internal/protocols/`** — protocol-specific executors (`http.go`, `websocket.go`). Each implements `engine.Executor`.
- **`backend/internal/metrics/`** — HDR histogram + atomic-counter collector + per-second snapshot.
- **`backend/internal/report/`** — aggregate computation, insights engine, HTML template, gofpdf PDF.
- **`backend/internal/api/`** — Gin router, key-auth + CORS + zap request-logger middleware, REST + SSE handlers.
- **`backend/internal/storage/`** — pgx pool, embedded SQL migrations applied at startup.
- **`frontend/src/pages/`** — Login, Dashboard, TestBuilder, History, Active Runs, LiveRun, Reports, ReportDetail, Environments, SavedTests.

Each side has its own deeper `CLAUDE.md` for contributors.

---

## API reference (short version)

| Method | Path                            | Purpose |
|--------|---------------------------------|---------|
| `POST` | `/api/auth/login`               | Validate key, return token. |
| `GET`  | `/api/auth/verify`              | Check current key is valid. |
| `GET`  | `/api/runs`                     | List all runs (200 most recent). |
| `POST` | `/api/runs`                     | Start a run. Body: `{config, curl?, created_by, jira_id, env_tag, …}`. |
| `GET`  | `/api/runs/:id`                 | Run status + metadata. |
| `POST` | `/api/runs/:id/stop`            | Cancel a running test. |
| `GET`  | `/api/runs/:id/live`            | **SSE stream** — `tick` per second, `done` at end. |
| `GET`  | `/api/reports/:id`              | Full report JSON (aggregates, verdict, insights). |
| `GET`  | `/api/reports/:id/html`         | Standalone HTML report (printable). |
| `GET`  | `/api/reports/:id/pdf`          | PDF report. Query params: `filename`, `orientation`, `include_charts`. |
| `GET`  | `/api/compare?a=&b=`            | Side-by-side aggregates + per-metric deltas for two runs. |
| CRUD   | `/api/tests`, `/api/environments` | Saved tests and target-host environments. |

All endpoints (except `/api/auth/login` and `/healthz`) require the access key in `X-Access-Key`, `Authorization: Bearer …`, or `?key=`.

---

## Deploying to your own server

ChoiceHammer is a single Docker Compose file. Easiest path:

```bash
# On a small VM (1 vCPU, 1GB RAM is plenty):
git clone https://github.com/apistress/apistress.git
cd apistress
cp .env.example .env
nano .env                  # set CH_ACCESS_KEY to a long random string

docker compose up -d --build
```

Put it behind any reverse proxy (Caddy, nginx, Cloudflare Tunnel) for HTTPS. Example Caddyfile:

```
apistress.example.com {
    handle /api/* {
        reverse_proxy localhost:8080
    }
    handle {
        reverse_proxy localhost:5173
    }
}
```

For production: rotate `CH_ACCESS_KEY`, restrict access to a VPN or IP allow-list, and back up the Postgres volume.

---

## Roadmap

- [x] Run comparison (regression diff between two runs)
- [ ] Pass/fail thresholds + Slack/email alerts
- [ ] Scheduled / recurring tests (cron)
- [ ] Multi-step scenarios with variable extraction
- [ ] gRPC + DB query protocols
- [ ] Distributed runners

See [issues](https://github.com/apistress/apistress/issues) and the in-repo `CLAUDE.md` files for the latest status.

---

## Contributing

Patches welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow. tl;dr:

1. Fork → branch → PR.
2. Backend changes: `cd backend && go mod tidy && go build ./... && go vet ./...`.
3. Frontend changes: `cd frontend && npm run lint && npm run build`.
4. Make sure `docker compose up` still boots cleanly.

## License

[MIT](LICENSE) — free to use, modify, and redistribute.
