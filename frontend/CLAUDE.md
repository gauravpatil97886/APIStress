# Choice Techlab — Frontend

React 18 + Vite + TypeScript + Tailwind. Charts via Recharts, animations via Framer Motion, icons via Lucide, toasts via react-hot-toast, routing via React Router v6, Excel parsing via SheetJS (`xlsx`).

Three end-user products live in this frontend, plus an admin console:
- **APIStress** — load testing dashboard (with Jira auto-attach + manual send)
- **PostWomen** — Postman-style API client (with a data-driven Runner)
- **Crosswalk** — Excel-themed VLOOKUP / data joiner (CSV streaming, virtualised result grid)
- **Admin** — teams, cross-tool Activity feed, Jira tab, audit log

All tools are registered in `src/tools/registry.tsx` (slug, label, icon, accent, route, page, chip). Adding a tool = one entry there + one slug in the backend `tools.AllSlugs`. App routing, sidebar gating, mode picker, admin tool toggles, and team chips all iterate the registry.

## Run locally

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
# expects backend on http://localhost:8080 (override with VITE_API_URL — note: build-time, not runtime)
```

## Layout

```
frontend/
├── public/logo.svg                 # brand mark also used as favicon
├── src/
│   ├── App.tsx                     # routes + auth + tools_access guards (registry-driven)
│   ├── main.tsx                    # ReactDOM + global Toaster
│   ├── index.css                   # Tailwind + design tokens + scrollbar
│   ├── tools/registry.tsx          # canonical tool list (slug, icon, accent, page, route)
│   ├── lib/api.ts                  # typed API client + key/team helpers + adminApi
│   ├── hooks/useLiveMetrics.ts     # SSE EventSource wrapper
│   ├── components/
│   │   ├── builder/                # TestBuilder helpers — JiraSection, CostInputs
│   │   ├── ui/                     # AppShell, MetricCard, JiraAttachButton,
│   │   │                           # JiraSendButton, JiraIssuePreview, …
│   │   ├── postwomen/              # PostWomen-specific UI
│   │   └── charts/                 # Latency / RPS / VU / Error charts (Recharts)
│   └── pages/
│       ├── Login.tsx               # team-key login (returns team + tools_access)
│       ├── ModePicker.tsx          # tool picker (registry-driven; skipped for 1-tool teams)
│       ├── Admin.tsx               # 4-tab admin console (Teams / Activity / Jira / Audit)
│       ├── Dashboard.tsx           # KPIs + recent runs (APIStress)
│       ├── TestBuilder.tsx         # curl import + request + load profile + Jira section
│       ├── SavedTests.tsx
│       ├── Runs.tsx                # all runs list
│       ├── LiveRun.tsx             # live SSE charts + stop
│       ├── Reports.tsx             # historical reports table
│       ├── ReportDetail.tsx        # report detail + JiraAttachButton (history + resend)
│       ├── History.tsx             # full run history + per-row JiraSendButton
│       ├── Environments.tsx
│       ├── postwomen/
│       │   ├── PostWomen.tsx       # collections + tabs + request editor + history
│       │   ├── Runner.tsx          # data-driven runner (CSV/XLSX/JSON, concurrency, macros, virtualised)
│       │   └── runner.worker.ts    # off-main-thread parsing
│       └── crosswalk/
│           ├── Crosswalk.tsx       # Excel-green VLOOKUP / join tool
│           └── crosswalk.worker.ts # streaming CSV + XLSX + hash-index join (off-thread)
└── tailwind.config.js              # brand colors + custom animations
```

## Auth & multi-tenancy

- Login posts the team's access key to `/api/auth/login`. Response includes the team (`id`, `name`, `tools_access`) and a token (== the key).
- Key stored in `localStorage` under `ch_access_key`; team JSON under `ch_team`. Sent as `X-Access-Key` on every fetch (and as `?key=…` for SSE because `EventSource` can't set headers).
- `lib/api.ts::clearKey()` clears both. 401 from any request triggers it and redirects to `/login`.
- **Tools-access gating** is enforced in three places:
  - `AppShell` redirects to `/postwomen` (or `/login`) if the team lacks `apistress`.
  - `ModePicker` filters / auto-skips when only one tool is available.
  - `PostWomen` redirects to `/` if the team lacks `postwomen`.
- Backend filtering is the source of truth — UI gating is a UX layer, not a security boundary.

## Admin console

`pages/Admin.tsx` lives in its own auth scope. The admin key is held in `sessionStorage` (`ch_admin_key`) and sent as `X-Admin-Key`. CRUD on teams, key rotation, enable/disable, tool toggles. CORS allows `X-Admin-Key`.

## Sign-out reachability

Every authenticated surface has a Sign out control:
- **AppShell desktop sidebar** — pill in the footer, alongside the PostWomen quick-switch.
- **AppShell mobile top bar** — small icon button on the right.
- **PostWomen top bar** — pill at the far right after Load test.
- **ModePicker top brand bar** — pill next to the live clock.

All four call `clearKey()` → toast → redirect to `/login`.

## Design system

- **Colors**: `brand` (orange), `bg`, `ink`, `good/warn/bad`, plus `cool` and `sky` accents — defined in `tailwind.config.js`.
- **Components**: utility classes in `index.css`: `.card`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input`, `.label`, `.pill`.
- **Animations**: Framer Motion for page transitions and list staggering; Tailwind keyframes for `pulse-soft` on the active sidebar item and live indicator.
- **Charts**: Recharts, themed dark via `index.css` overrides. All chart components live under `components/charts/` and accept a normalised `data` array (`{t, p50_ms, p95_ms, p99_ms, requests, errors, active_vus}`).
- **Toasts**: global `<Toaster>` styled in `main.tsx` — call `toast.success(...)` / `toast.error(...)` from any handler.

## Required attribution

`TestBuilder` requires `created_by` and (`jira_id` || `jira_link`) before allowing a start. The "Saved Tests → Run" path also prompts for them. The backend rejects starts without these fields, so the UI checks are belt-and-braces.

## PostWomen — Runner

`pages/postwomen/Runner.tsx` is a Postman-style collection runner restricted to a single saved request:

- Upload CSV / TSV / JSON / XLSX (multi-sheet workbooks → sheet picker). Parsing runs in `runner.worker.ts` so the main thread never blocks; preview + results are virtualised; result state is throttled-flushed every 250 ms.
- Each column becomes a `{{column}}` variable substituted into URL, headers, query, and body (raw / json / urlencoded / form-data).
- Built-in `{{$macro}}` helpers for synthetic data: `uuid`, `now`, `now:iso`, `timestamp`, `timestampMs`, `randomEmail`, `randomString`, `randomInt:lo-hi`.
- Settings: iterations cap, delay ms, concurrency 1–10 (parallel iterations, beyond Postman), pass rule (2xx / `status =` / `status in range`), stop-on-error, **save-history toggle off by default** (so a 5-lakh-row run doesn't bloat `pw_history`).
- In-app spreadsheet viewer with sticky headers, row filter, per-row checkboxes, per-column toggles, live preview of the resolved request against the selected row.
- Results table with status / latency / bytes / pass/fail, click-through inspector showing the resolved request + full response.
- Retry-failed-only after a partial run.
- Export results to CSV (original row data + status + duration + bytes + error + resolved URL).
- Implementation is purely client-side templating; each iteration calls the existing team-scoped `POST /api/postwomen/send`. No new backend endpoints.

## Crosswalk

`pages/crosswalk/Crosswalk.tsx` — Excel-themed VLOOKUP / data-join tool. Upload primary + lookup files, pick join columns, splice columns from one into the other.

- Parsing runs in `crosswalk.worker.ts` (`File.stream()` for CSV/TSV — realistic ~10 GB; SheetJS for XLSX up to 5 M rows).
- Hash-index join on the lookup column → O(n+m). Streams progress (`reading` → `decoding` → `shaping` → `indexing` → `joining`).
- Three views: **Merged** / **Matched** / **Unmatched**, with filter, virtualised result grid (Excel-paper alternating rows + faint gridlines), and CSV / XLSX export of the current view.
- Synthetic `_match` column flags `match` / `multi(N)` / `no-match`.
- Theme: emerald gradient header, ribbon-dark column headers, paper-toned cards.

## Jira integration

Jira lives in three places on the frontend:
- **TestBuilder** (`components/builder/JiraSection.tsx`) — first-class section with Atlassian-blue header + connection pill, big ticket-ID input with smart paste (extracts key from a pasted Jira URL), live `JiraIssuePreview` (assignee avatar + status + priority pills), comment-template radio (Detailed / Brief / Critical), iOS-style toggle for auto-attach. Auto-attach **defaults OFF every visit** — explicit opt-in per run.
- **Report detail** (`components/ui/JiraAttachButton.tsx`) — full attach card with attach-history strip, per-row Resend, custom comment override. Modal renders via React Portal so it always escapes parent stacking contexts.
- **History list** (`components/ui/JiraSendButton.tsx`) — compact icon button per row. Module-level health cache so 200 rows on a long history page only fire one `/api/jira/health` call (refreshed every 60 s).

Errors from any path surface as prominent `toast.error` notifications next to where the user clicked.

## Admin console

`pages/Admin.tsx` is a separate auth scope (`sessionStorage` admin key, `X-Admin-Key` header). Tabs:
- **Teams** — CRUD with registry-driven tool toggles.
- **Activity** — cross-tool event feed with filters (team, tool, event, search), KPIs, hourly timeline (Recharts area), tool-adoption bar chart, top-teams ranking, event-type breakdown chips. Auto-refresh (10 s) toggle + CSV export. Per-row inspector modal for raw meta JSON.
- **Jira** — dedicated dashboard with: Atlassian-blue header strip, **`ConnectedAsCard`** (avatar + name + email + accountId of the service account, with re-probe button), KPIs (Total attaches / Success rate / Successes / Errors), per-team usage bars (green/red split), most-attached issues, two-column success/error feed (last 100 of each).
- **Audit** — admin mutation history.

## Sign-out reachability

## Adding a page

1. Create `src/pages/Foo.tsx`.
2. Register the route in `App.tsx` (inside the `<AppShell>` route).
3. If it should appear in the sidebar, add an entry to `NAV_GROUPS` in `components/ui/AppShell.tsx`.

## Adding a backend call

1. Add a typed method to `api` (or `adminApi`) in `lib/api.ts` so it goes through the shared auth + 401 handling.
2. The 401 handler clears the key and redirects to `/login` automatically — don't reimplement that.

## Docker / Vite gotcha

`VITE_API_URL` is **baked at build time**. Setting it as a runtime env on a built image does nothing. The compose file passes it as a Docker build arg (`args.VITE_API_URL`) so the production image bakes whatever the operator wants. For dev, `.env` is sufficient.
