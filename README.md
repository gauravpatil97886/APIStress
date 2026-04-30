<div align="center">

# Choice Techlab Internal Tools

### Internal multi-tool platform for the Choice Techlab engineering team.

</div>

> **Internal use only.** This repository is the source of the Choice Techlab
> developer toolkit. It is intended strictly for use inside the Choice Techlab
> organisation. It is not a product, not a service, and not for external
> distribution.

---

## What's inside

A single Go + React stack hosting four tools behind a shared team-scoped auth
and admin layer:

| Slug         | Tool         | What it does                                                                          |
|--------------|--------------|---------------------------------------------------------------------------------------|
| `apistress`  | **APIStress**| HTTP / WebSocket load testing — VUs, ramp / spike / stages, HDR-histogram metrics, PDF reports, run comparison. |
| `postwomen`  | **PostWomen**| Postman-style API client — collections, environments, curl import / export, data-driven Runner (CSV / XLSX iteration with macros). |
| `crosswalk`  | **Crosswalk**| Excel-themed VLOOKUP / data-join tool — streams large CSVs in a Web Worker, virtualised result grid, CSV / XLSX export. |
| `kavach`     | **Kavach**   | API VAPT scanner — paste-a-request, fan out hostile probes, plain-English findings, PDF, Jira filing. |

Plus an **Admin console** (`/admin`) for managing teams, viewing the cross-tool
activity feed, the Jira dashboard, and the audit log.

---

## Quick start (internal dev)

```bash
# Postgres + backend + frontend, all in Docker
docker compose up --build

# Open http://localhost:5173
#   Default access key:   choicehammer-dev-key   ("Legacy" team)
#   Default admin key:    97886                  → /admin console
```

Or run pieces locally:

```bash
make backend     # backend on :8080
make frontend    # frontend on :5173
make cli         # builds ./bin/hammer
```

Each subdirectory has its own `CLAUDE.md` with deeper architectural notes.

---

## Architecture in 60 seconds

- **Backend** — Go (Gin) service. APIStress engine spins goroutine-pooled
  virtual users, batches results into HDR histograms, emits one
  `SecondBucket` per second, and persists to Postgres.
- **Frontend** — React 18 + Vite + Tailwind. Charts via Recharts, animations
  via Framer Motion, icons via Lucide.
- **Storage** — PostgreSQL with idempotent migrations.
- **Live metrics** — SSE on `/api/runs/:id/live`.
- **Auth** — every request goes through team-scoped middleware that
  bcrypt-validates the access key and stamps `team_id` on the request.
  Every read / write filters by team. No cross-team data leakage.
- **Admin** — separate `CH_ADMIN_KEY` gate on `/api/admin/*`. Admins can
  create / rename / delete / disable teams, rotate keys, and toggle
  per-team tool access.
- **Activity feed** — backend and frontend funnel events into a single
  `activity_log` table (auth, runs, Jira attaches, admin mutations).
- **Jira** — env-driven Atlassian Cloud or Server / Data Center client.
  Auto-attach hook fires on run completion.

---

## Configuration

All settings are environment variables. See `.env.example` for the full list.
The most important ones:

| Variable          | Purpose                                                           |
|-------------------|-------------------------------------------------------------------|
| `CH_HTTP_ADDR`    | Backend listen address (default `:8080`).                         |
| `CH_POSTGRES_DSN` | Postgres connection string.                                       |
| `CH_ACCESS_KEY`   | Seed key for the auto-created **Legacy** team. Rotate per env.    |
| `CH_ADMIN_KEY`    | Gate for `/api/admin/*`.                                          |
| `CH_JIRA_*`       | Jira integration (see backend `CLAUDE.md`).                       |
| `VITE_API_URL`    | Where the frontend looks for the backend (build-time, not runtime).|

---

## Repo layout

```
choicehammer/
├── backend/          # Go service (engine + API + CLI + admin + teams + activity + jira)
├── frontend/         # React 18 + Vite + Tailwind — APIStress + PostWomen + Crosswalk + Kavach + Admin
├── docker-compose.yml
├── Makefile
└── scripts/
```

---

## Internal use notice

This codebase is not licensed for use outside Choice Techlab. Do not publish,
redistribute, or share access with anyone outside the organisation. Bug
reports, change requests, and patches are managed through the internal Jira
and Git workflow only.
