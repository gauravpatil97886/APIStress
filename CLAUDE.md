# Choice Techlab Toolkit

> Internal multi-tool platform: **APIStress** (load testing) + **PostWomen** (API client) + **Crosswalk** (Excel data joiner) behind a shared team-scoped auth/admin layer with Jira integration and a cross-tool activity feed.

Go (Gin) backend, React 18 frontend, PostgreSQL for storage, optional `hammer` CLI.

## Tools

| Slug | Name | What it does |
|---|---|---|
| `apistress` | APIStress | Load testing — VUs, ramp/spike/stages, HDR-histogram metrics, PDF reports, run comparison |
| `postwomen` | PostWomen | Postman-style API client — collections, environments, curl import/export, **Runner** (data-driven CSV/XLSX iteration with macros) |
| `crosswalk` | Crosswalk | Excel-themed VLOOKUP / data-join tool — streams ~10 GB CSV via Web Worker, virtualised result grid, CSV / XLSX export |

Adding a new tool requires editing **one frontend entry** (`frontend/src/tools/registry.tsx`) and **one backend slug** (`backend/internal/tools/registry.go`); everything else (routes, sidebar, mode picker, admin tool toggles, default landing) iterates the registry.

## Repo layout

```
choicehammer/
├── backend/          # Go service (engine + API + CLI + admin + teams + activity + jira)
├── frontend/         # React 18 + Vite + Tailwind — APIStress + PostWomen + Crosswalk + Admin
├── docker-compose.yml
├── Makefile
├── .env              # local dev env (dummy creds, safe to commit *for this internal tool*)
└── .env.example
```

Each side has its own `CLAUDE.md` with deeper context.

## Quick start

```bash
# 1. Postgres + backend + frontend, all in Docker (with healthchecks)
docker compose up --build

# 2. Open http://localhost:5173
#    Default access key:   choicehammer-dev-key   → "Legacy" team
#    Default admin key:    97886                  → /admin console

# 3. Or run pieces locally:
make backend     # backend on :8080 (or CH_HTTP_ADDR=:8088 for dev)
make frontend    # frontend on :5173
make cli         # builds ./bin/hammer
```

Docker now uses BuildKit cache mounts, non-root runtime user on the backend, healthchecks on every service, and `VITE_API_URL` is passed as a Docker build arg (Vite bakes it at build time, so runtime env vars don't help).

## Architecture in 60 seconds

- **Engine** (`backend/internal/engine`): a `Runner` orchestrates a goroutine pool of virtual users that hammer a target. A `Scheduler` computes the desired VU count over time (constant / ramp / spike / stages). A `Batcher` drains per-request results, feeds an HDR-histogram-backed `Collector`, and emits a `SecondBucket` once per second. The manager exposes a **`SetFinishHook`** that fires once per run terminal state — used by the Jira auto-attach feature.
- **Persistence**: Postgres stores tests, runs, per-second metric snapshots, environments, PostWomen workspaces/collections/requests/history, teams, team_keys, team_members, admin_audit, **activity_log** (cross-tool events) and **jira_attachments** (paper trail of every report sent to Jira). Schemas live in `backend/internal/storage/migrations/00{1..5}_*.sql` and are applied on boot in order.
- **Live metrics**: The API exposes SSE at `/api/runs/:id/live`. The frontend's `useLiveMetrics` hook subscribes via `EventSource`. SSE auth is team-scoped (uses `TeamAuth`, accepts `?key=` so EventSource can reach it).
- **Auth model — multi-tenant**: every request goes through `middleware.TeamAuth` which bcrypt-validates the access key, looks up the owning team, and stashes `team_id`/`team_name` into the gin context. Every read/write handler filters by `team_id`. No row leakage across teams.
- **Admin**: `/api/admin/*` is gated by a separate `CH_ADMIN_KEY` (header `X-Admin-Key`). Admins can list / create / rename / delete / disable teams, rotate access keys, toggle each team's `tools_access`, and view a 4-tab dashboard: **Teams**, **Activity** (cross-tool events with charts and filters), **Jira** (success/error feeds + per-team usage), **Audit** (admin-mutation history). `admin_audit` records every admin mutation.
- **Activity tracking**: an `internal/activity.Service` is the unified event sink. Backend emits events for `auth.login` / `auth.login_failed` / `feature.run.start|stop` / `feature.jira.attach|error` / `admin.action`. Frontend posts client-side events (`auth.logout`, `tool.open`, `feature.crosswalk.{join,export}`, etc.) to `POST /api/activity` — backend trusts the team_id from auth context, never the body, and validates against an allow-list. All inserts are best-effort (logged on error, never bubbled up to user requests).
- **Jira integration** (`internal/jira` + `internal/api/handlers/jira.go`): env-driven (`CH_JIRA_BASE_URL`, `CH_JIRA_AUTH_KIND`, `CH_JIRA_EMAIL`, `CH_JIRA_API_TOKEN`, `CH_JIRA_PROJECT_KEY`). Supports both Atlassian Cloud (Basic auth `email:token`) and Server/Data Center (Bearer PAT). Operations: health probe (`/api/jira/health`), live issue lookup with assignee + avatar (`/api/jira/issue/:key`), attach run report (`/api/runs/:id/attach-jira`), list past attachments (`/api/runs/:id/jira-attachments`). Auto-attach hook on `Manager` finish-event uploads PDF + posts a wiki-formatted comment that mentions the issue's assignee. All paths logged to `jira_attachments` + `activity_log`.
- **Reports**: HTML rendered from a Go `html/template`, PDF generated server-side with `gofpdf` (no headless Chrome). Both include the operator's name and Jira link.
- **Logging**: zap logger with daily file rotation in `backend/logs/choicehammer-YYYY-MM-DD.log` plus a colourised stdout stream.

## Multi-tenancy

- Every user-data table (`runs`, `tests`, `environments`, `pw_workspaces`, `pw_history`) has a nullable `team_id UUID REFERENCES teams(id)`. Pre-multitenant rows are backfilled to the auto-created **Legacy** team during boot bootstrap.
- PostWomen `pw_collections` and `pw_requests` are scoped *transitively* through their workspace's `team_id`; handlers do an ownership-by-workspace check before any read/update/delete.
- Login response includes `tools_access`. Frontend uses it to gate UI: `AppShell`, `ModePicker`, and `PostWomen` redirect away when a team lacks the relevant tool. Single-tool teams bypass the mode picker entirely.

## Required attribution on every run

Every load run captures `created_by`, `jira_id`, and `jira_link`. The frontend forces these in the test builder; the API rejects starts without them. They appear at the top of every PDF/HTML report.

## PostWomen Runner

Inside PostWomen, the **Runner** tab takes a saved request + a CSV / TSV / JSON / XLSX dataset and iterates the request once per row, substituting `{{column}}` placeholders into the URL, headers, query, and body. Beyond what Postman's runner does: parallel concurrency (1–10), built-in `{{$macro}}` helpers (`uuid`, `now`, `randomEmail`, `randomInt:lo-hi`, …), in-app spreadsheet viewer with column / row toggles, retry-failed-only, and CSV export of results. Implementation is frontend-only; each iteration calls the existing team-scoped `/api/postwomen/send`. Big-file safe: parsing runs in a Web Worker, results table is virtualised, run state is throttled-flushed every 250 ms.

## Crosswalk

Excel-themed VLOOKUP / data-join tool. Upload a primary + lookup file, pick join columns, splice columns from one into the other. CSVs are parsed via `File.stream()` line-by-line in a dedicated worker (`crosswalk.worker.ts`) — realistic ceiling ~10 GB. XLSX uses SheetJS in-memory; capped at 5 M rows / file. The hash-index join is O(n+m), result preview is virtualised, exports to CSV or XLSX. Frontend-only; no backend storage.

## Jira integration

The "Attach to Jira" feature lives in three places:
- **TestBuilder** — auto-attach toggle (defaults OFF every visit), live issue preview as the user types, three comment templates (Detailed / Brief / Critical).
- **Report detail** — `JiraAttachButton` with attach-history strip; per-row "Resend" + custom comment override.
- **History list** — `JiraSendButton` per row, opens a portal modal so it works inside any table cell.

The auto-attach finish hook (`cmd/server/main.go::autoAttachOnFinish`) re-renders the PDF and posts a wiki-formatted summary comment that mentions the issue's assignee using `[~accountid:xxx]` (Cloud) or `[~name]` (Server). Every success and failure is recorded in `activity_log` (`feature.jira.attach` / `feature.jira.error`) so the admin's **Jira tab** can show a connection-status header, KPIs (success rate, totals), per-team usage bars, most-attached issues, and a green / red split feed of the last 100 events.

## Conventions

- **Time**: per-second buckets are the unit of truth for charts. Internally we record latency in **microseconds** (HDR histogram), display in **milliseconds**.
- **Backwards compat**: this is an internal tool. Break schemas freely; add `00N_*.sql` migration files and rebuild.
- **Tests**: not yet present. When adding, prefer integration tests against a real Postgres in Docker.
- **Team scoping is non-negotiable**: any new handler that reads or writes user data MUST filter by `middleware.TeamID(c)`. The router puts these handlers behind the `protected` group (`r.Group("/api", middleware.TeamAuth(teamSvc))`).
