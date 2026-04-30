# APIStress — frontend

The shell tool. Owns the `AppShell` sidebar plus all sub-routes (Dashboard, TestBuilder, SavedTests, Runs, LiveRun, Reports, ReportDetail, History, Compare, Environments, Overview).

## Layout

```
src/tools/apistress/
├── components/
│   ├── builder/
│   │   ├── CostInputs.tsx       # cost-calculator inputs panel
│   │   └── JiraSection.tsx      # Atlassian-blue ticket section
│   ├── charts/                  # Recharts wrappers — accept normalised
│   │   │                         # { t, p50_ms, p95_ms, p99_ms, requests,
│   │   │                         #   errors, active_vus } arrays
│   │   ├── ErrorRateChart.tsx
│   │   ├── LatencyChart.tsx
│   │   ├── RpsChart.tsx
│   │   ├── StatusDonut.tsx
│   │   └── VuChart.tsx
│   └── ui/
│       └── CostCard.tsx         # cost summary card on ReportDetail
└── pages/
    ├── Dashboard.tsx            # KPIs + recent runs
    ├── TestBuilder.tsx          # curl import + request + load profile + Jira
    ├── SavedTests.tsx
    ├── Runs.tsx                 # all runs list
    ├── LiveRun.tsx              # live SSE charts + stop
    ├── Reports.tsx              # historical reports table
    ├── ReportDetail.tsx         # report + JiraAttachButton (history + resend)
    ├── History.tsx              # full history + per-row JiraSendButton
    ├── Compare.tsx              # 2-up run comparison
    ├── Environments.tsx
    └── Overview.tsx             # cross-team overview
```

## Builder requirements

`TestBuilder` enforces:
- `created_by` is required (non-empty string).
- One of `jira_id` or `jira_link` is required.
- The "Start" button is disabled until both are present.

The backend rejects starts without these fields too — the UI checks are belt-and-braces.

`JiraSection` (atlassian-blue header + connection pill) auto-attaches **OFF every visit** — explicit opt-in per run. Three comment templates: Detailed / Brief / Critical.

## Live SSE

`LiveRun.tsx` uses `useLiveMetrics(runId)` from `platform/hooks/useLiveMetrics.ts`. The hook owns the `EventSource` (with `?key=` because EventSource can't set headers), reconnect-on-stale logic, and a normalised event stream. Charts subscribe to slices of the buffered series.

## Jira flows

- **TestBuilder** uses `JiraSection` (this folder) which embeds `JiraIssuePreview` from `platform/components/jira/`.
- **ReportDetail** uses `JiraAttachButton` from `platform/components/jira/`.
- **History** uses `JiraSendButton` from `platform/components/jira/`.

The two reusable buttons keep a module-level health cache so a 200-row history page only fires one `/api/jira/health` call.

## Pages walkthrough

- **Dashboard** — entry point. Recent runs, top KPIs, link cards.
- **TestBuilder** — paste curl → it parses URL/headers/body. Pick load pattern (constant / ramp / spike / stages), VUs, duration. Cost panel optional. Jira section. "Start test".
- **SavedTests** — re-run a saved profile. Same created_by + Jira gate as the builder.
- **Runs** — all runs. Click → LiveRun (if running) or ReportDetail.
- **LiveRun** — live charts (Latency, RPS, VU, Error). Stop button. Auto-redirects to ReportDetail on completion.
- **Reports** / **ReportDetail** — historical view. ReportDetail offers HTML / PDF download + Jira attach with attach-history strip.
- **History** — denser table with per-row Jira send.
- **Compare** — 2-run side-by-side; Verdict banner picks a winner.
- **Environments** — `{{var}}` storage used by TestBuilder + PostWomen.

## Styling

Theme accent: **brand orange**. From `platform/components/layout/registry.tsx::themeFor("brand")`. Severity / status colours stay conventional regardless.
