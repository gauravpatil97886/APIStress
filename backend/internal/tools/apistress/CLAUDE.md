# APIStress — backend

Load testing tool. Runs goroutine-pooled virtual users against an HTTP / WebSocket target and captures HDR-histogram-quality metrics.

## Layout

```
internal/tools/apistress/
├── engine/                # Manager, Runner, Scheduler, Batcher, Pool, virtualuser
├── metrics/               # HDR histogram + Collector + per-second snapshots
├── protocols/             # http.go, websocket.go (impl engine.Executor)
├── cost/                  # AWS-style cost calculator + pricing table
├── report/                # HTML template + gofpdf PDF + sparkline SVG
└── handlers/              # tests.go, runs.go, live.go, reports.go, compare.go,
                           # cost.go, environments.go, util.go (newID)
```

`package handlers` here is distinct from `internal/platform/handlers` — the router imports it as alias `ash`.

## Engine flow

1. `engine.Manager.Start(ctx, cfg, testID, meta, teamID)` writes a `runs` row, builds a `Runner`, returns a `ManagedRun`.
2. `Runner` boots three coroutines:
   - **Scheduler**: every 100 ms, computes target VU count from the load pattern (constant / ramp / spike / stages).
   - **Supervisor**: every 200 ms, spawns or cancels VU goroutines to match target.
   - **Batcher**: drains the result channel, updates HDR histogram + atomic counters, flushes one `SecondBucket` per second via the manager's `OnBucket` callback.
3. Each VU runs `Execute → record → optional think-time → repeat` until its context is cancelled.
4. `OnBucket` persists to `run_metrics` and broadcasts to all `LiveSubscriber`s.
5. On terminal state, `Manager.SetFinishHook` callbacks fire (used for Jira auto-attach).

## HDR histogram

- Latency stored in **microseconds** (engine), displayed in **milliseconds** (frontend).
- Mutex-protected — single writer (the batcher), so contention is minimal.
- `metrics/snapshot.go` exposes p50 / p90 / p95 / p99 / max for whatever window the caller requests.

## Per-second buckets

`SecondBucket` is the unit of truth for charts. It contains:
- requests / errors / active_vus
- p50 / p95 / p99 (ms)
- avg / min / max (ms)
- bytes received

`runs.summary` (jsonb) on terminal state contains totals + the full bucket series — that's what powers historical charts and PDFs without re-querying `run_metrics`.

## Required attribution

API rejects `POST /runs` without `created_by` AND (`jira_id` OR `jira_link`). UI checks are belt-and-braces.

## Protocols

`protocols.New(kind, …)` returns an `engine.Executor`. Adding a new protocol:
1. Implement `Execute(ctx) Result` + `Close()` in `protocols/<name>.go`.
2. Wire it into `protocols/protocol.go::New`.

The engine never sees the wire — only the `Result` (status, duration, bytes, error).

## Cost calculator

`cost/calculator.go` consumes a finished run summary + an operator-supplied `CostInputs` payload (instance type, infra hourly rate, cost-per-1k-requests, etc.) and returns a structured `CostBreakdown`. Pure function, no side effects. The `CostHandler` exposes the static pricing table; the actual calculation runs at report-render time.

## Reports

`report/generator.go` aggregates `runs.summary` + bucket series into an `AggregateReport`. `report/pdf.go` lays it out via `gofpdf` (no headless Chrome). `report/chart.go` builds inline sparkline SVGs that embed cleanly into the PDF.

## Auto-attach Jira hook

`cmd/server/main.go::autoAttachOnFinish` is registered via `Manager.SetFinishHook`. When a run finishes with `RunMeta.AutoAttachJira == true`, it re-renders the PDF, attaches via the Jira REST client, and posts an assignee-mentioning wiki-formatted comment built by `BuildJiraSummaryComment`. Failures land in `activity_log` as `feature.jira.error`.
