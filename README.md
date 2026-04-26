<div align="center">

# ⚡ APIStress

### **Hit your APIs hard. Know exactly what breaks.**

A modern, self-hosted load-testing tool with a beautiful dashboard, real-time charts, plain-English insights, and shareable PDF reports.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Postgres](https://img.shields.io/badge/Postgres-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-FF5A1F.svg)](CONTRIBUTING.md)

[**Quick Start**](#-quick-start-30-seconds) ·
[**Features**](#-features) ·
[**Why APIStress**](#-the-problem-this-tool-solves) ·
[**Screenshots**](#-screenshots) ·
[**Architecture**](#-how-it-works)

</div>

---

## 🎯 The problem this tool solves

Every API team needs to answer one question before a release:

> **"Will this hold up when real traffic arrives?"**

Today the options are bad:

| Tool                    | What hurts                                                                                              |
|-------------------------|---------------------------------------------------------------------------------------------------------|
| **k6 / Gatling / wrk**  | CLI-only. You write JavaScript or Scala. No dashboard. No history. No "share this report with my team". |
| **JMeter**              | Heavy desktop app from 2001. Confusing XML config. Reports look like a 90s spreadsheet.                 |
| **LoadRunner**          | Enterprise pricing. Steep learning curve.                                                               |
| **Loader.io / k6 Cloud / BlazeMeter** | SaaS. Per-test pricing. Sends your URLs to a third party. Locked behind a credit card.                 |
| **Postman runner**      | Useless past 50 VUs. No real percentiles, no time-series.                                              |

**APIStress fixes all of this:**

- ✅ **Self-hosted** — your traffic, your servers, no third party.
- ✅ **One-click install** — `git clone && ./scripts/install.sh` and you're done in under a minute.
- ✅ **Beautiful UI** — paste a `curl` command, click Start. No YAML, no scripting language.
- ✅ **Real metrics** — HDR-histogram-backed p50 / p75 / p90 / p95 / p99 / p999 — the same accuracy as k6, served live as the test runs.
- ✅ **Plain-English reports** — "Test Failed: p95 of 764 ms exceeds 500 ms target" instead of a wall of numbers.
- ✅ **Shareable** — every run produces a polished PDF with the operator's name and Jira ticket on it. Send it to your manager. Attach it to the incident.
- ✅ **Free** — MIT license. Run unlimited tests. Forever.

---

## ✨ Features

- 🔐 **Key-only login** — paste a shared key, you're in. No user accounts to manage.
- 📋 **Curl import** — paste any `curl …` command and it becomes a configured test in one click.
- 📈 **Load patterns** — constant load, ramp-up, spike, multi-stage.
- 📊 **HDR-histogram-backed metrics** — accurate percentiles, not misleading averages.
- 🛰️ **Live SSE charts** — latency, throughput, active VUs, errors per second update every second.
- 🧠 **Smart insights** — the tool tells you *why* the test failed and *what to fix* (e.g. *"p99 latency is 914 ms — usually GC pauses, lock contention, or queueing. Add tracing to find which segment of the request is slow."*)
- 📑 **Beautiful HTML + PDF reports** — branded, with verdict banner ("Passed / Degraded / Failed"), executive summary, percentile table, status code donut, and a recommendations section.
- 🏷️ **Environment tags** — every run is tagged `Production` / `Broking (pre-prod)` / `UAT` so you always know what was hit.
- 👤 **Attribution** — every report shows **who ran the test** + **clickable Jira link** + timestamps.
- 🕓 **History** — every run kept forever, searchable and filterable by user, status, and environment.
- 🔁 **Re-run** — open any past run, hit one button, re-test with the same config.
- ↔️ **Run comparison** — pick any two runs, see overlaid charts and per-metric green/red deltas. Catch regressions instantly.
- 📥 **Customisable PDF export** — pick filename, orientation, optionally exclude charts.
- 🔔 **Background notifications** — start a test, navigate away, get a toast when it's done with a "View report" button.
- ⌨️ **CLI** (`hammer`) — for terminal users and CI pipelines.
- 🪵 **Daily-rotating structured logs** — `backend/logs/apistress-YYYY-MM-DD.log`.
- 📱 **Fully responsive** — works on a laptop, a tablet, or your phone.
- 🌑 **Dark UI** — easy on the eyes in any war-room.

---

## 📸 Screenshots

| Live test run | HTML report | History |
|---|---|---|
| ![live](https://github.com/user-attachments/assets/cdb25334-a090-46d1-9b05-b12154aeb270) | ![report](https://github.com/user-attachments/assets/1c6491e2-693b-4c76-a1bb-2eeabe36e3bd) | ![history](https://github.com/user-attachments/assets/69c2edb0-4e71-4b8f-837c-d0fe8f5ded09) |

---

## 🚀 Quick Start (30 seconds)

> **Prerequisites:** Docker + Docker Compose v2.

### One-line install

```bash
git clone https://github.com/gauravpatil97886/APIStress.git \
  && cd APIStress \
  && ./scripts/install.sh
```

The installer:
1. Verifies Docker is installed.
2. Copies `.env.example` → `.env`.
3. Generates a fresh random access key (so you don't ship the demo key to prod).
4. Builds the containers and waits for the backend to come up.
5. Prints your URL + access key when it's ready.

That's it. Open **http://localhost:5173**, paste the key, and you're testing.

### Manual install

```bash
git clone https://github.com/gauravpatil97886/APIStress.git
cd APIStress
cp .env.example .env             # ⚠️ change CH_ACCESS_KEY for production!
docker compose up --build        # or `make up`
```

| Service  | URL                       | Default credentials                  |
|----------|---------------------------|--------------------------------------|
| Frontend | http://localhost:5173     | login key: `choicehammer-dev-key`    |
| Backend  | http://localhost:8080     | API key in `X-Access-Key` header     |
| Postgres | `localhost:5432`          | `choicehammer` / `choicehammer`      |

To stop:

```bash
docker compose down            # stop, keep DB
docker compose down -v         # stop, also wipe DB volume
```

---

## 🛠 Local development (no Docker for the app)

Run only Postgres in Docker:

```bash
docker run -d --name apistress-db \
  -e POSTGRES_USER=choicehammer -e POSTGRES_PASSWORD=choicehammer -e POSTGRES_DB=choicehammer \
  -p 5432:5432 postgres:16-alpine
```

**Backend:**
```bash
cd backend && go mod tidy
CH_ACCESS_KEY=dev CH_HTTP_ADDR=:8080 \
CH_POSTGRES_DSN='postgres://choicehammer:choicehammer@localhost:5432/choicehammer?sslmode=disable' \
go run ./cmd/server
```

**Frontend:**
```bash
cd frontend && npm install
VITE_API_URL=http://localhost:8080 npm run dev
```

**CLI:**
```bash
make cli
./bin/hammer --api http://localhost:8080 --key dev \
  run --url https://httpbin.org/get --vus 20 --duration 30 \
  --by "Your Name" --jira CT-123 --env Production
```

---

## ⚙️ Configuration

All settings are environment variables (see `.env.example`):

| Variable               | Default                                                                       | Description |
|------------------------|-------------------------------------------------------------------------------|-------------|
| `CH_HTTP_ADDR`         | `:8080`                                                                       | API listen address. |
| `CH_POSTGRES_DSN`      | `postgres://choicehammer:choicehammer@localhost:5432/choicehammer?sslmode=disable` | Postgres connection string. |
| `CH_ACCESS_KEY`        | `choicehammer-dev-key`                                                        | **Required.** The shared key everyone uses to log in. **Rotate for production.** |
| `CH_LOG_DIR`           | `logs`                                                                        | Where daily-rotating log files are written. |
| `CH_LOG_LEVEL`         | `info`                                                                        | `debug` / `info` / `warn` / `error`. |
| `CH_MAX_VUS`           | `50000`                                                                       | Hard cap on simultaneous virtual users. |
| `VITE_API_URL`         | `http://localhost:8080`                                                       | Where the frontend looks for the backend. |

---

## 🏗 How it works

```
            ┌──────────────────────────────────┐
            │   React 18 + Vite + Tailwind     │   live SSE charts
            │   key-only login                 │   PDF/HTML report viewer
            └────────────────┬─────────────────┘
                             │ REST + Server-Sent Events
            ┌────────────────▼─────────────────┐
            │   Go (Gin) API + Load Engine     │
            │  ┌─────────────────────────────┐ │
            │  │ Runner ▸ Scheduler ▸ Pool   │ │   spawns goroutine VUs
            │  │ Batcher ▸ HDR Histogram     │ │   per-second snapshots
            │  └──────────────┬──────────────┘ │
            │  Insights engine, PDF renderer   │
            └─────────────────┼────────────────┘
                              │ pgx connection pool
                              ▼
                       ┌────────────┐
                       │ PostgreSQL │   runs · run_metrics · tests · envs
                       └────────────┘
```

- **`backend/internal/engine/`** — `Runner` orchestrates a goroutine pool of virtual users. `Scheduler` decides how many VUs to keep alive each tick. `Batcher` drains results once a second into the metrics collector.
- **`backend/internal/metrics/`** — HDR histogram + atomic counters. Hot path is lock-free.
- **`backend/internal/protocols/`** — protocol-specific executors (HTTP, WebSocket today; gRPC and DB next). Each implements `engine.Executor`.
- **`backend/internal/report/`** — aggregates raw buckets into final stats, runs the **insights engine** (the rules that say "p95 above 500 ms = warn, p99 above 1000 ms = bad, error rate above 1 % = warn"), then renders polished HTML / PDF.
- **`backend/internal/api/`** — Gin router with key-auth, CORS, structured zap request logging, and SSE streaming.
- **`frontend/src/`** — pages, components, and the responsive AppShell. Animations via Framer Motion, charts via Recharts, icons via Lucide, toasts via react-hot-toast.

---

## 🌐 API quick reference

| Method | Path                              | Purpose                                                     |
|--------|-----------------------------------|-------------------------------------------------------------|
| `POST` | `/api/auth/login`                 | Validate key, return token.                                 |
| `GET`  | `/api/auth/verify`                | Check current key.                                          |
| `GET`  | `/api/runs`                       | List recent runs.                                           |
| `POST` | `/api/runs`                       | Start a run (`{config, curl?, created_by, jira_id, env_tag}`). |
| `GET`  | `/api/runs/:id`                   | Run status + metadata.                                      |
| `POST` | `/api/runs/:id/stop`              | Cancel a running test.                                      |
| `GET`  | `/api/runs/:id/live`              | **SSE stream** — `tick` per second, `done` at end.          |
| `GET`  | `/api/reports/:id`                | Full report JSON (aggregates + verdict + insights).         |
| `GET`  | `/api/reports/:id/html`           | Standalone HTML report (printable).                         |
| `GET`  | `/api/reports/:id/pdf`            | PDF report. `?filename=&orientation=&include_charts=`.      |
| `GET`  | `/api/compare?a=&b=`              | Side-by-side aggregates + per-metric deltas for two runs.   |
| CRUD   | `/api/tests`, `/api/environments` | Saved tests and target-host environments.                   |

All endpoints (except `/api/auth/login` and `/healthz`) require the access key in `X-Access-Key`, `Authorization: Bearer …`, or `?key=`.

---

## 🚢 Production deployment

APIStress is one Docker Compose file. Easiest path:

```bash
ssh you@your-vm
git clone https://github.com/gauravpatil97886/APIStress.git
cd APIStress
./scripts/install.sh        # generates a strong CH_ACCESS_KEY
```

Front it with any HTTPS reverse proxy. Example **Caddy**:

```caddyfile
apistress.example.com {
    handle /api/* {
        reverse_proxy localhost:8080
    }
    handle {
        reverse_proxy localhost:5173
    }
}
```

For production: rotate `CH_ACCESS_KEY`, restrict access via VPN or firewall allow-list, back up the Postgres volume, and put the whole stack behind your SSO/proxy of choice.

---

## 🗺 Roadmap

- [x] Run comparison (regression diff between two runs)
- [ ] Pass/fail thresholds + Slack/email alerts
- [ ] Scheduled / recurring tests (cron)
- [ ] Multi-step scenarios with variable extraction
- [ ] gRPC + database query protocols
- [ ] Distributed runners (multi-region load generation)

See [issues](https://github.com/gauravpatil97886/APIStress/issues) for the latest.

---

## 🤝 Contributing

Patches welcome! See [**CONTRIBUTING.md**](CONTRIBUTING.md). The short version:

1. Fork → branch → PR.
2. `cd backend && go build ./... && go vet ./...` — must pass.
3. `cd frontend && npm run lint && npm run build` — must pass.
4. `docker compose up --build` — must boot cleanly.

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and redistribute. No warranty.

---

<div align="center">

### Created by **[Gaurav Patil](https://github.com/gauravpatil97886)**

If APIStress saves you a sleepless night before a release, [follow me on GitHub](https://github.com/gauravpatil97886) — that's the only payment I want.

⭐ **Star this repo** to help other engineers find it.

[![Follow @gauravpatil97886](https://img.shields.io/github/followers/gauravpatil97886?label=Follow%20%40gauravpatil97886&style=social)](https://github.com/gauravpatil97886)
[![Stars](https://img.shields.io/github/stars/gauravpatil97886/APIStress?style=social)](https://github.com/gauravpatil97886/APIStress)

</div>
