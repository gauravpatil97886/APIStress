# Kavach — frontend

API VAPT scanner. 6-view shell with confirm-host gate, plain-English drawer tabs, and Jira hooks for filing findings.

## Layout

```
src/tools/kavach/
├── components/
│   ├── KavachAttachJiraButton.tsx   # attach the whole scan PDF to a Jira ticket
│   └── KavachFileJiraButton.tsx     # file ONE finding as a new Jira issue
└── pages/
    ├── Kavach.tsx                   # outer shell — view router + sidebar
    ├── KavachAbout.tsx              # marketing / what-this-is page
    ├── KavachSetup.tsx              # paste request, pick categories, confirm host, start
    ├── KavachLive.tsx               # live SSE — progress + findings stream as they appear
    ├── KavachReport.tsx             # final report — findings list + per-finding drawer
    ├── KavachDetails.tsx            # historical scan detail (same drawer)
    └── KavachHistory.tsx            # all past scans for the team
```

Theme accent: **cyan** (cyan-to-teal) — reads as technical / pentest-tool, distinct from APIStress orange / PostWomen sky / Crosswalk emerald.

## Six-view shell

`Kavach.tsx` is the outer shell. It owns the sidebar (About / Setup / Live / Report / History) and routes to the right inner page based on scan state. The active scan ID is in the URL so reload doesn't lose state.

## Confirm-host gate

`KavachSetup.tsx` requires the user to **explicitly check** "Yes, I am authorised to scan `<host>`" before the Start button enables. The host is parsed from the pasted request and shown verbatim. Belt-and-braces with the backend's confirmation gate in `runner.go`.

## Live SSE

`KavachLive.tsx` opens an `EventSource` against `/api/kavach/scans/:id/live?key=…`. Events:

- `snapshot` — initial state on connect.
- `progress` — running / completed test counts.
- `test` — per-test PASS / FAIL (so the test-pass-rate ring updates incrementally).
- `finding` — push a new Finding into the list.
- `done` — final summary; UI swaps to the Report view.

## Plain-English drawer

Click any finding → side drawer with **three tabs**:

1. **Technical** — what the test sent, what came back, the matched indicator.
2. **Explain like I'm five** — `what_is_this` + `why_it_matters` + `how_to_fix` from the backend (`kv_findings` columns, populated from `TestExplanations`).
3. **Reproduce** — copy-paste curl that re-runs just this probe.

Severity → ribbon colour:
- `critical` red
- `high` orange
- `medium` amber
- `low` cyan
- `info` slate

## Jira hooks

- **`KavachAttachJiraButton`** (component) — attach the whole-scan PDF to an existing Jira issue (same UX as APIStress's `JiraAttachButton`).
- **`KavachFileJiraButton`** (component) — open a modal that drafts a new Jira issue from a single finding: severity → priority, title from finding name, body from the plain-English fields, labels = `["kavach","vapt", category]`.

Both reuse `JiraIssuePreview` from `platform/components/jira/`.

## Tool isolation

- Imports `platform/api/client`, `platform/api/curl` (curl-paste in Setup), `platform/hooks/useLiveMetrics` (SSE wrapper), `platform/components/jira/JiraIssuePreview`, plus a few `platform/components/ui/*` (MetricCard, …).
- Does NOT import from `tools/apistress/*`, `tools/postwomen/*`, or `tools/crosswalk/*`.
