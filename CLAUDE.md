# Choice Techlab Toolkit

> Internal multi-tool platform: **APIStress** (load testing) + **PostWomen** (API client) + **Crosswalk** (Excel data joiner) + **Kavach** (API VAPT) behind a shared team-scoped auth/admin layer with Jira integration and a cross-tool activity feed.

Go (Gin) backend, React 18 frontend, PostgreSQL for storage, optional `hammer` CLI.

## Tools

| Slug | Name | What it does |
|---|---|---|
| `apistress` | APIStress | Load testing — VUs, ramp/spike/stages, HDR-histogram metrics, PDF reports, run comparison |
| `postwomen` | PostWomen | Postman-style API client — collections, environments, curl import/export, **Runner** (data-driven CSV/XLSX iteration with macros) |
| `crosswalk` | Crosswalk | Excel-themed VLOOKUP / data-join tool — streams ~10 GB CSV via Web Worker, virtualised result grid, CSV / XLSX export |
| `kavach`    | Kavach    | API VAPT scanner — paste a request, runs hostile probes (transport, info disclosure, injection, method tampering), produces plain-English findings + PDF, Jira-linkable |

Adding a new tool requires editing **two registries** (frontend `frontend/src/tools/registry.tsx` and backend `backend/internal/platform/tools/registry.go`); everything else (routes, sidebar, mode picker, admin tool toggles, default landing) iterates the registry.

## Repo layout — per-tool isolation

```
choicehammer/
├── backend/
│   ├── cmd/{server,hammer}/
│   └── internal/
│       ├── platform/                  # SHARED INFRA — used by every tool
│       │   ├── activity/              # cross-tool event sink
│       │   ├── api/{router.go,middleware/}
│       │   ├── config/                # env-driven config
│       │   ├── curl/                  # curl-string parser
│       │   ├── handlers/              # cross-tool handlers (auth, activity, jira, util, admin/)
│       │   ├── jira/                  # Jira REST client
│       │   ├── logger/                # zap + daily-rotating files
│       │   ├── storage/               # pgx pool + embedded migrations
│       │   ├── teams/                 # multi-tenant team service
│       │   └── tools/                 # canonical slug registry (AllSlugs)
│       └── tools/                     # PER-TOOL — one folder per product
│           ├── apistress/{engine,metrics,protocols,cost,report,handlers}/
│           ├── postwomen/{store,handlers}/
│           └── kavach/{*.go (engine + tests + report + persistence), handlers/}
├── frontend/
│   └── src/
│       ├── App.tsx / main.tsx / index.css
│       ├── platform/                  # SHARED — used by every tool or platform-only
│       │   ├── api/{client.ts,curl.ts}
│       │   ├── components/{layout,ui,jira}/
│       │   ├── hooks/{useDocumentTitle,useLiveMetrics}.ts
│       │   └── pages/{Login,ModePicker,Admin}.tsx
│       ├── store/                     # zustand store(s) — cross-tool
│       └── tools/
│           ├── registry.tsx           # canonical tool list
│           ├── apistress/{components/{builder,charts,ui},pages}/
│           ├── postwomen/{components,pages}/
│           ├── crosswalk/pages/
│           └── kavach/{components,pages}/
├── docker-compose.yml
├── Makefile
└── .env / .env.example
```

Each major tier has its own `CLAUDE.md`:
- `backend/CLAUDE.md`, `frontend/CLAUDE.md`
- `backend/internal/tools/<slug>/CLAUDE.md` for each tool
- `frontend/src/tools/<slug>/CLAUDE.md` for each tool

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

## Architecture in 60 seconds

- **Engine** (`backend/internal/tools/apistress/engine`): a `Runner` orchestrates a goroutine pool of virtual users that hammer a target. A `Scheduler` computes the desired VU count over time (constant / ramp / spike / stages). A `Batcher` drains per-request results, feeds an HDR-histogram-backed `Collector`, and emits a `SecondBucket` once per second. The manager exposes a **`SetFinishHook`** that fires once per run terminal state — used by the Jira auto-attach feature.
- **Persistence**: Postgres stores tests, runs, per-second metric snapshots, environments, PostWomen workspaces/collections/requests/history, Kavach scans/findings, teams, team_keys, team_members, admin_audit, **activity_log** (cross-tool events) and **jira_attachments** (paper trail of every report sent to Jira). Migrations live in `backend/internal/platform/storage/migrations/00{1..8}_*.sql` and are applied on boot in order.
- **Live metrics**: APIStress and Kavach both expose SSE (`/api/runs/:id/live`, `/api/kavach/scans/:id/live`). The frontend's `useLiveMetrics` hook subscribes via `EventSource`. SSE auth is team-scoped (uses `TeamAuth`, accepts `?key=` so EventSource can reach it).
- **Auth model — multi-tenant**: every request goes through `middleware.TeamAuth` which bcrypt-validates the access key, looks up the owning team, and stashes `team_id`/`team_name` into the gin context. Every read/write handler filters by `team_id`. No row leakage across teams.
- **Admin**: `/api/admin/*` is gated by a separate `CH_ADMIN_KEY` (header `X-Admin-Key`). 4-tab dashboard: **Teams**, **Activity** (cross-tool events with charts and filters), **Jira** (success/error feeds + per-team usage), **Audit** (admin-mutation history).
- **Activity tracking**: an `internal/platform/activity.Service` is the unified event sink. Backend emits events for `auth.login` / `auth.login_failed` / `feature.run.start|stop` / `feature.jira.attach|error` / `admin.action`. Frontend posts client-side events through an allow-list. All inserts are best-effort.
- **Jira integration** (`internal/platform/jira` + `internal/platform/handlers/jira.go`): env-driven, supports both Atlassian Cloud (Basic auth) and Server/Data Center (Bearer PAT). Auto-attach hook on `Manager` finish-event uploads PDF + posts a wiki-formatted comment that mentions the issue's assignee.
- **Reports**: HTML rendered from a Go `html/template`, PDF generated server-side with `gofpdf`.
- **Logging**: zap logger with daily file rotation in `backend/logs/choicehammer-YYYY-MM-DD.log` plus colourised stdout.

## Adding a new tool

1. **Pick a slug** (lowercase, one word). Example: `flashlight`.
2. **Backend**:
   - Create `backend/internal/tools/flashlight/` with `handlers/`, `engine/` (if needed), and any sub-packages your tool requires.
   - Append the slug to `backend/internal/platform/tools/registry.go::AllSlugs`.
   - Wire your handler endpoints into `backend/internal/platform/api/router.go` (import the new handlers package with a short alias, register routes inside the `protected` group).
   - Add a numbered migration `backend/internal/platform/storage/migrations/00N_<slug>.sql`.
3. **Frontend**:
   - Create `frontend/src/tools/flashlight/{pages,components}/`.
   - Append a `ToolDef` entry to `frontend/src/tools/registry.tsx` (slug, label, tagline, chip, accent, routePath, shell, Icon, Page).
4. Done. `App.tsx`, `AppShell`, `ModePicker`, `Admin` all auto-iterate the registry.

## Coding standards

### Tool isolation
- Code under `backend/internal/tools/<slug>/` may **NOT** import from another tool's directory. Same rule for `frontend/src/tools/<slug>/`.
- If two tools genuinely need the same code, the dependency belongs in `platform/`. No exceptions.
- Tools may import from `platform/`, but `platform/` may **NEVER** import from `tools/`.

### One-handler-per-file
- Each route handler in its own `.go` file under `<tool>/handlers/` (e.g. `runs.go`, `tests.go`, `live.go`).
- Helper functions live alongside the handler that uses them, or in a `util.go` next to them.

### Migrations
- Numbered, embedded (`go:embed migrations/*.sql`), applied in order on boot.
- Always idempotent: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`.
- Never reorder existing migrations. Add new ones with the next number.
- This is an internal tool — break schemas freely, just add a new migration.

### Errors
- Backend: zap-style structured logs (`logger.Error("send failed", zap.String("run_id", id), zap.Error(err))`). Never silently swallow.
- Frontend: surface user-visible failures via `toast.error("…")`. 401 from any request triggers `clearKey()` + redirect to `/login`.

### Team scoping (non-negotiable)
- Every handler that reads or writes user data **MUST** filter by `middleware.TeamID(c)`.
- UI gating (sidebar hide, redirect on missing tool) is a UX layer, **not** a security boundary.
- New handlers go inside the `protected` group (`r.Group("/api", middleware.TeamAuth(teamSvc))`).

### Naming
- Go: package names lowercase one-word; types CamelCase; receivers short (`h *Handler`, `m *Manager`).
- React: components PascalCase; files match the component name (`MetricCard.tsx` exports `MetricCard`).
- Frontend imports stay relative — no path aliases configured today.

### Comments
- Only when the WHY is non-obvious. No tutorial-style docblocks. No "this function does X" lines.
- A comment that explains a trade-off, a non-obvious ordering, or a concurrency invariant is welcome.

### State management
- Backend goroutines: scope to a `context.Context`; cancellation drains. Never use bare global mutexes for anything other than HDR-histogram-style hot spots.
- Frontend: local `useState` first; lift to a zustand store under `frontend/src/store/` only when a value is genuinely cross-page.

### Activity events
- Every meaningful user action emits `feature.<tool>.<verb>` via `activity.Service.Log` from the backend, or `api.logActivity()` from the frontend (allow-listed event names only).
- Best-effort: never bubble activity-log failures up to the user request.

### Color theming
- Each tool picks one accent (orange/sky/green/cyan/violet) — defined in `frontend/src/tools/registry.tsx::themeFor(accent)`.
- Severity / status colours stay conventional (red/amber/green) regardless of tool theme.

### Reports / PDFs
- Each tool generates its own PDF under `backend/internal/tools/<slug>/report/` (or co-located with the tool's handlers when small).
- A shared `psafe()` ASCII transliteration helper lives in `platform/` so every tool can use it.

### Jira flows
- Tool-specific Jira UI (e.g. `KavachAttachJiraButton`, APIStress's `JiraSection`) lives in the tool's components dir.
- Reusable Jira UI (`JiraIssuePreview`, `JiraAttachButton`, `JiraSendButton`) lives in `frontend/src/platform/components/jira/`.
- Backend Jira REST client is in `backend/internal/platform/jira/`.

### Testing
- Prefer integration tests against a real Postgres in Docker. No mocks for the DB layer.
- Reason: prior incidents where mock/prod divergence masked broken migrations.

### Agents / cron / hooks
- Don't add MCP servers, Claude Code hooks, or cron jobs without user approval — they touch shared state.

## Multi-tenancy

- Every user-data table (`runs`, `tests`, `environments`, `pw_workspaces`, `pw_history`, `kv_scans`, …) has a `team_id UUID REFERENCES teams(id)`. Pre-multitenant rows are backfilled to the auto-created **Legacy** team during boot bootstrap.
- PostWomen `pw_collections` and `pw_requests` are scoped *transitively* through their workspace's `team_id`.
- Login response includes `tools_access`. Frontend uses it to gate UI; backend filtering is the source of truth.

## Required attribution on every run

Every load run captures `created_by`, `jira_id`, and `jira_link`. The frontend forces these in the test builder; the API rejects starts without them. They appear at the top of every PDF/HTML report.

## Conventions

- **Time**: per-second buckets are the unit of truth for charts. Internally we record latency in **microseconds** (HDR histogram), display in **milliseconds**.
- **Backwards compat**: this is an internal tool. Break schemas freely; add `00N_*.sql` migration files and rebuild.
- **Tests**: not yet present. When adding, prefer integration tests against a real Postgres in Docker.
- **Team scoping is non-negotiable**: any new handler that reads or writes user data MUST filter by `middleware.TeamID(c)`.
