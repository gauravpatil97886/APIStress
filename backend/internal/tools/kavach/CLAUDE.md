# Kavach — backend

API VAPT (Vulnerability Assessment + Penetration Testing) scanner. Branded "Kavach" (Sanskrit for *shield / armour*). Operator pastes an HTTP request as a `Target`, Kavach fans out a battery of hostile probes, and emits per-test PASS/FAIL findings + plain-English explanations.

## Layout

```
internal/tools/kavach/
├── types.go                       # Target, Test, Finding, TestResult, Severity, ScanID
├── engine.go                      # Manager (start/stop/list/get), SSE pub-sub, snapshots
├── runner.go                      # per-scan orchestrator: filters Catalog, runs each Test
├── safety.go                      # request redaction (auth headers, credentials), confirmation gate
├── catalog.go                     # var Catalog []Test — populated from per-category init()s
├── explanations.go                # test_id → plain-English description map
├── test_transport.go              # TLS / HSTS / mixed-content probes
├── test_infodisclosure.go         # server / x-powered-by / debug headers / verbose errors
├── test_injection.go              # SQLi / NoSQLi / XSS basics
├── test_injection_extra.go        # SSRF / command-injection / template-injection
├── test_methodtampering.go        # method override, PUT/DELETE access, OPTIONS leak
├── report.go                      # PDF generator
├── persistence.go                 # kv_scans / kv_findings reads + writes
└── handlers/
    └── kavach.go                  # /api/kavach/* + SSE
```

All files share `package kavach`. (We considered splitting into `engine/`, `tests/`, `report/`, `persistence/` sub-packages but the cross-references — every test file uses `Target`, `Test`, `Finding` from `types.go` — would have meant either circular imports or a much larger refactor. Single package keeps reorganisation a pure rename.)

## Test interface

```go
type Test struct {
    ID       string
    Category string
    Name     string
    Severity Severity
    Run      func(ctx context.Context, t Target, c *http.Client) []Finding
}
```

Each test is **tiny + self-contained**. It receives the parsed `Target` plus a stock `http.Client` and returns zero-or-more `Finding`s. Adding a new test = append to the relevant category's `<Category>Tests()` slice.

## Catalog

`catalog.go::init()` glues the per-category slices into the master `Catalog`. The runner filters this slice by the operator's enabled categories.

## Severity → Jira priority

Mapped in the handler when filing a Jira issue from a finding:

| Kavach severity | Jira priority |
|---|---|
| `critical` | Highest |
| `high`     | High    |
| `medium`   | Medium  |
| `low`      | Low     |
| `info`     | Lowest  |

## SSE pub-sub

`Manager` publishes `Event`s of kind `snapshot` / `progress` / `test` / `finding` / `done`. Subscribers (the SSE handler) get an unbuffered channel scoped to a `context.Context`; the manager drops on a slow consumer rather than blocking.

## Redaction (safety.go)

Before storing a `Target` we scrub:
- `Authorization` / `Cookie` / `Set-Cookie` / `Proxy-Authorization`
- common API-key headers (`x-api-key`, `apikey`, `x-auth-token`, …)
- query-string secrets (`token=`, `key=`, `password=`)

The original (unredacted) Target lives in memory only for the duration of the scan.

## Confirm-host gate

`runner.go` refuses to start a scan unless the operator has explicitly confirmed the target host in the request payload. Prevents accidental fire-on-prod when pasting a curl into the wrong tab.

## Plain-English fields

Migration `008_vapt_explanation.sql` adds `what_is_this`, `why_it_matters`, `how_to_fix` columns to `kv_findings`. Populated from the test's matching entry in `TestExplanations`. The frontend renders these in the drawer's "Explain like I'm five" tab.

## Tool isolation

- May import `platform/{logger,jira,storage,activity}`.
- Must NOT import from sibling tools. The Kavach handler uses the platform Jira client directly.
