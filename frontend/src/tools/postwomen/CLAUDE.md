# PostWomen — frontend

Postman-style API client (with a far-better Runner). Standalone shell — no `AppShell` sidebar; its own top bar with collections sidebar + tabs.

## Layout

```
src/tools/postwomen/
├── components/
│   └── Logo.tsx                # PWWordmark + PWLogo (sky-accent brand mark)
└── pages/
    ├── PostWomen.tsx           # main shell — collections sidebar + tabs + request editor + history
    ├── Runner.tsx              # data-driven Runner (CSV / TSV / JSON / XLSX)
    └── runner.worker.ts        # off-main-thread file parsing
```

Theme accent: **sky** (light blue). Distinct from APIStress orange / Crosswalk emerald / Kavach cyan.

## Main editor (PostWomen.tsx)

- Workspaces → collections → requests tree on the left.
- Tabs across the top — each tab is one open request.
- Editor has Method + URL + Params / Headers / Body / Auth / Tests-stub.
- Body modes: `none` / `raw` (with JSON pretty) / `form-urlencoded` / `form-data` / `binary`.
- "Send" → calls team-scoped `/api/postwomen/send`. Response panel shows status, time, size, headers, body.
- "Save" persists into the selected collection.
- Postman 2.1 import / export buttons.
- History tab — per-team `pw_history` rows.

## Runner (data-driven)

Restricted to a single saved request. The killer feature.

Flow:
1. Upload CSV / TSV / JSON / XLSX (multi-sheet → sheet picker).
2. Parsing runs in `runner.worker.ts` so the main thread never blocks.
3. Each column becomes a `{{column}}` variable substituted into URL, headers, query, and body (raw / json / urlencoded / form-data).
4. Built-in `{{$macro}}` helpers — `uuid`, `now`, `now:iso`, `timestamp`, `timestampMs`, `randomEmail`, `randomString`, `randomInt:lo-hi`.
5. Settings:
   - iterations cap
   - delay ms
   - **concurrency 1–10** (parallel iterations — beyond Postman)
   - pass rule (2xx / `status =` / `status in range`)
   - stop-on-error
   - **save-history toggle off by default** (5-lakh-row run otherwise floods `pw_history`)
6. In-app spreadsheet viewer with sticky headers, row filter, per-row checkboxes, per-column toggles, live preview of the resolved request against the selected row.
7. Results table (status / latency / bytes / pass-fail). Click → inspector with resolved request + full response.
8. Retry-failed-only after a partial run.
9. Export results to CSV (original row + status + duration + bytes + error + resolved URL).

Implementation is purely client-side templating — each iteration calls the existing team-scoped `POST /api/postwomen/send`. **No new backend endpoints.**

Performance:
- Parsing → web worker.
- Big result tables → virtualised.
- Run-state updates → throttled-flushed every 250 ms (otherwise React re-renders murder the UI on long runs).

## Auth

Uses the same `X-Access-Key` header as the rest of the app. If the team lacks `postwomen` in `tools_access`, the page redirects home.

## Tool isolation

- Imports `platform/api/client`, `platform/api/curl` (for curl-import paste in the editor), `platform/components/jira/JiraIssuePreview` (when attaching a saved-request to Jira — though this path is mostly Kavach/APIStress's domain).
- Does NOT import from `tools/apistress/*` or `tools/kavach/*`.
