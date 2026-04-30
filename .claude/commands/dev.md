---
description: Engage the Senior Developer agent to implement a change. Pass it a clear spec (or run `/pm` first to produce one).
argument-hint: [task to implement, e.g. "add /api/kavach/scans/:id/csv endpoint"]
---

Use the `Agent` tool with `subagent_type: "developer"` to implement the following task. The developer must follow the project's coding standards (per-tool isolation, multi-tenancy filtering, plain-English copy, no scope expansion, no new dependencies without approval).

After implementation, the developer must run:
- `cd backend && go build ./...`
- `cd frontend && npx tsc --noEmit 2>&1 | grep -vE "ImportMeta|error_reasons"`

and report a 5-line summary of what changed.

Task: $ARGUMENTS
