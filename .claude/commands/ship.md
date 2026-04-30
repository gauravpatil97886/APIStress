---
description: Full pipeline — PM scopes, Developer implements, Tester verifies. Use for non-trivial work.
argument-hint: [request to ship, e.g. "add CSV export to Kavach reports"]
---

This is a three-stage pipeline that mirrors how a small product team ships an internal tool change.

**Stage 1 — PM scopes the request.** Use the `Agent` tool with `subagent_type: "product-manager"` to produce a one-page spec for the request below. Wait for the spec.

**Stage 2 — Developer implements.** Use the `Agent` tool with `subagent_type: "developer"`, passing the PM's spec as context. The developer implements the smallest diff that satisfies the acceptance criteria, runs `go build ./...` + `tsc --noEmit`, and reports a 5-line summary.

**Stage 3 — Tester verifies.** Use the `Agent` tool with `subagent_type: "tester"`, passing both the spec and the developer's summary as context. The tester runs the test plan and reports PASS/FAIL + a ship/fix-first recommendation.

Surface the final tester recommendation back to the user. If the tester says "fix-first", do NOT auto-loop — report the failure and stop, so the user can decide.

Request: $ARGUMENTS
