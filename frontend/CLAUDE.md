# ChoiceHammer — Frontend

React 18 + Vite + TypeScript + Tailwind. Charts via Recharts, animations via Framer Motion, icons via Lucide, toasts via react-hot-toast, routing via React Router v6.

## Run locally

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
# expects backend on http://localhost:8080 (override with VITE_API_URL)
```

## Layout

```
frontend/
├── public/logo.svg                 # brand mark also used as favicon
├── src/
│   ├── App.tsx                     # routes + auth guard
│   ├── main.tsx                    # ReactDOM + global Toaster
│   ├── index.css                   # Tailwind + design tokens + scrollbar
│   ├── lib/api.ts                  # typed API client + key helpers
│   ├── hooks/useLiveMetrics.ts     # SSE EventSource wrapper
│   ├── components/
│   │   ├── ui/                     # Logo, AppShell, MetricCard, RunStatusBadge, LiveIndicator
│   │   └── charts/                 # Latency / RPS / VU / Error charts (Recharts)
│   └── pages/
│       ├── Login.tsx               # key-only login (no username/password)
│       ├── Dashboard.tsx           # KPIs + recent runs
│       ├── TestBuilder.tsx         # curl import + request + load profile + Jira/owner
│       ├── SavedTests.tsx
│       ├── Runs.tsx                # all runs list
│       ├── LiveRun.tsx             # live SSE charts + stop
│       ├── Reports.tsx             # historical reports table (HTML / PDF download)
│       ├── ReportDetail.tsx
│       └── Environments.tsx
└── tailwind.config.js              # brand colors + custom animations
```

## Auth

Single shared key, no usernames. The login page POSTs to `/api/auth/login`; on success the key is stored in `localStorage` (`ch_access_key`) and sent as `X-Access-Key` on every fetch. SSE uses `?key=` because `EventSource` can't set headers. The `Protected` route guard in `App.tsx` redirects to `/login` if no key is present, and `lib/api.ts` clears the key on any 401.

## Design system

- **Colors**: `brand` (orange), `bg`, `ink`, `good/warn/bad` — defined in `tailwind.config.js`.
- **Components**: utility classes in `index.css`: `.card`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input`, `.label`, `.pill`.
- **Animations**: Framer Motion for page transitions and list staggering; Tailwind keyframes for `pulse-soft` on the active sidebar item and live indicator.
- **Charts**: Recharts, themed dark via `index.css` overrides. All chart components live under `components/charts/` and accept a normalised `data` array (`{t, p50_ms, p95_ms, p99_ms, requests, errors, active_vus}`).
- **Toasts**: global `<Toaster>` styled in `main.tsx` — call `toast.success(...)` / `toast.error(...)` from any handler.

## Required attribution

`TestBuilder` requires `created_by` and (`jira_id` || `jira_link`) before allowing a start. The "Saved Tests → Run" path also prompts for them. The backend rejects starts without these fields, so the UI checks are belt-and-braces.

## Adding a page

1. Create `src/pages/Foo.tsx`.
2. Register the route in `App.tsx` (inside the `<AppShell>` route).
3. If it should appear in the sidebar, add an entry to `items` in `components/ui/AppShell.tsx`.
