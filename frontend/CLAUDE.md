# Choice Techlab — Frontend

React 18 + Vite + TypeScript + Tailwind. Charts via Recharts, animations via Framer Motion, icons via Lucide, toasts via react-hot-toast, routing via React Router v6, Excel parsing via SheetJS (`xlsx`).

Four end-user products live in this frontend, plus an admin console:
- **APIStress** — load testing dashboard (with Jira auto-attach + manual send)
- **PostWomen** — Postman-style API client (with a data-driven Runner)
- **Crosswalk** — Excel-themed VLOOKUP / data joiner (CSV streaming, virtualised result grid)
- **Kavach** — API VAPT scanner (paste-a-request, plain-English findings, PDF, Jira)
- **Admin** — teams, cross-tool Activity feed, Jira tab, audit log

All tools are registered in `src/tools/registry.tsx` (slug, label, icon, accent, route, page, chip). Adding a tool = one entry there + one slug in the backend `tools.AllSlugs`. App routing, sidebar gating, mode picker, admin tool toggles, and team chips all iterate the registry.

## Run locally

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
# expects backend on http://localhost:8080 (override with VITE_API_URL — note: build-time, not runtime)
```

## Layout — platform vs tools

```
frontend/
├── public/logo.svg
├── src/
│   ├── App.tsx                       # routes + auth guards (registry-driven)
│   ├── main.tsx                      # ReactDOM + global Toaster
│   ├── index.css                     # Tailwind + design tokens
│   ├── platform/                     # SHARED — used by every tool
│   │   ├── api/
│   │   │   ├── client.ts             # typed API client + key/team helpers + adminApi
│   │   │   └── curl.ts               # curl-string parser (used by 3 tools)
│   │   ├── components/
│   │   │   ├── layout/               # AppShell, Logo, ChoiceTechlabMark, EnvPill
│   │   │   ├── ui/                   # MetricCard, VerdictBanner, RunStatusBadge, RunNotifier,
│   │   │   │                         # MiniCountdown, RunCountdown, LiveIndicator,
│   │   │   │                         # PDFDownloadModal, CreatedBy, TestedBy
│   │   │   └── jira/                 # JiraIssuePreview, JiraAttachButton, JiraSendButton
│   │   ├── hooks/
│   │   │   ├── useDocumentTitle.ts
│   │   │   └── useLiveMetrics.ts     # SSE EventSource wrapper
│   │   └── pages/
│   │       ├── Login.tsx             # team-key login (returns team + tools_access)
│   │       ├── ModePicker.tsx        # tool picker (registry-driven)
│   │       └── Admin.tsx             # 4-tab admin console
│   ├── store/                        # zustand store(s) — cross-tool
│   └── tools/
│       ├── registry.tsx              # canonical tool list (slug, icon, accent, page, route)
│       ├── apistress/
│       │   ├── components/
│       │   │   ├── builder/          # TestBuilder helpers — JiraSection, CostInputs
│       │   │   ├── charts/           # Latency / RPS / VU / Error charts (Recharts)
│       │   │   └── ui/               # CostCard
│       │   └── pages/                # Dashboard, TestBuilder, SavedTests, Runs, LiveRun,
│       │                             # Reports, ReportDetail, History, Compare,
│       │                             # Environments, Overview
│       ├── postwomen/
│       │   ├── components/           # PostWomen Logo
│       │   └── pages/                # PostWomen, Runner + runner.worker.ts
│       ├── crosswalk/
│       │   └── pages/                # Crosswalk + crosswalk.worker.ts
│       └── kavach/
│           ├── components/           # KavachAttachJiraButton, KavachFileJiraButton
│           └── pages/                # Kavach (shell), KavachAbout, KavachDetails,
│                                     # KavachLive, KavachReport, KavachSetup, KavachHistory
└── tailwind.config.js
```

## Tool isolation rules

- **Tools may import from `platform/`.** Always.
- **Platform may NEVER import from `tools/`.**
- **Tools may NOT import from sibling tools.** If two tools genuinely need the same code, lift it into `platform/`.

There are no path aliases configured today — imports are relative. Examples (from `tools/apistress/pages/LiveRun.tsx`):

```ts
import { api } from "../../../platform/api/client";          // tool → platform ✓
import { LatencyChart } from "../components/charts/LatencyChart"; // same tool ✓
```

## Auth & multi-tenancy

- Login posts the team's access key to `/api/auth/login`. Response includes the team (`id`, `name`, `tools_access`) and a token (== the key).
- Key stored in `localStorage` under `ch_access_key`; team JSON under `ch_team`. Sent as `X-Access-Key` on every fetch (and as `?key=…` for SSE because `EventSource` can't set headers).
- `platform/api/client.ts::clearKey()` clears both. 401 from any request triggers it and redirects to `/login`.
- **Tools-access gating** is enforced in three places:
  - `AppShell` redirects to `/postwomen` (or `/login`) if the team lacks `apistress`.
  - `ModePicker` filters / auto-skips when only one tool is available.
  - Standalone tools (PostWomen, Crosswalk, Kavach) redirect home if the team lacks them.
- Backend filtering is the source of truth — UI gating is a UX layer, not a security boundary.

## Tool registry pattern

`src/tools/registry.tsx` is the **single** place where the user-facing tool list lives. Add a new tool in three places (registry + page file + backend slug list) and these auto-pick it up:

- `App.tsx` mounts standalone tool routes from `TOOLS.filter(t => t.shell === "standalone")`.
- `AppShell` renders quick-jump pills for every enabled tool.
- `ModePicker` renders a card per enabled tool.
- `Login` picks a default landing route via `defaultLandingFor(tools_access)`.
- `Admin` renders tool toggles when editing a team's `tools_access`.

## Sign-out reachability

Every authenticated surface has a Sign out control:
- **AppShell desktop sidebar** — pill in the footer.
- **AppShell mobile top bar** — small icon button on the right.
- **PostWomen / Kavach / Crosswalk top bars** — pill at the far right.
- **ModePicker top brand bar** — pill next to the live clock.

All call `clearKey()` → toast → redirect to `/login`.

## Design system

- **Colors**: `brand` (orange), `bg`, `ink`, `good/warn/bad`, plus `cool` and `sky` accents — defined in `tailwind.config.js`.
- **Components**: utility classes in `index.css`: `.card`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input`, `.label`, `.pill`.
- **Animations**: Framer Motion for page transitions and list staggering; Tailwind keyframes for `pulse-soft`.
- **Charts**: Recharts, themed dark via `index.css` overrides.
- **Toasts**: global `<Toaster>` styled in `main.tsx` — call `toast.success(...)` / `toast.error(...)` from any handler.

## Required attribution (APIStress)

`TestBuilder` requires `created_by` and (`jira_id` || `jira_link`) before allowing a start. The "Saved Tests → Run" path also prompts for them. The backend rejects starts without these fields.

## File / component naming

- React components are PascalCase (`MetricCard.tsx` exports `MetricCard`).
- Hooks are `useFooBar.ts` exporting `useFooBar`.
- Workers are `*.worker.ts` and live next to the page that uses them.
- Files match the component / hook name, one default-or-named export per file.

## Adding a page (within an existing tool)

1. Create `src/tools/<slug>/pages/Foo.tsx`.
2. Register the route in `App.tsx` (inside the `<AppShell>` route for APIStress; inside the standalone tool's own router for others).
3. If it should appear in the sidebar, add an entry to `NAV_GROUPS` in `platform/components/layout/AppShell.tsx`.

## Adding a backend call

1. Add a typed method to `api` (or `adminApi`) in `platform/api/client.ts` so it goes through the shared auth + 401 handling.
2. The 401 handler clears the key and redirects to `/login` — don't reimplement that.

## Docker / Vite gotcha

`VITE_API_URL` is **baked at build time**. Setting it as a runtime env on a built image does nothing. The compose file passes it as a Docker build arg (`args.VITE_API_URL`).
