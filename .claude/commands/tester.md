---
description: Engage the QA / Tester agent to verify recent changes, run the test plan, and report regressions.
argument-hint: [optional: what to focus on, e.g. "verify Kavach jira flow"]
---

Use the `Agent` tool with `subagent_type: "tester"` to verify the most recent changes. The tester should:

1. Read the diff (`git diff main...HEAD` if on a feature branch, else `git diff HEAD~1`).
2. Build a test plan covering the change + multi-tenancy + auth invariants.
3. Execute the plan and report PASS/FAIL with one-line evidence per step.
4. Recommend ship / fix-first / needs-spec.

The tester may write `*_test.go` / `*.test.ts` files but MUST NOT edit production code.

Focus area (optional): $ARGUMENTS
