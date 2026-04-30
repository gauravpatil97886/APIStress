# Claude Code setup for Choice Techlab Internal Tools

This project ships with three Claude Code subagents that mirror a small product team. They keep the main conversation cheap (read-only or scoped), enforce the project's coding standards, and reduce token usage by isolating context per role.

## The agents

| Slash command | Subagent       | Role                                                                                  | Tools                                       | Model  |
|---------------|----------------|---------------------------------------------------------------------------------------|---------------------------------------------|--------|
| `/pm`         | product-manager| Scopes vague requests into a one-page spec. Read-only.                                | Read, Grep, Glob, WebSearch, WebFetch       | sonnet |
| `/tester`     | tester         | Verifies recent changes — diff review, test plan, execution, regression report.       | Read, Grep, Glob, Bash, Write (tests only)  | sonnet |
| `/dev`        | developer      | Implements features and fixes. Strict adherence to coding standards in `CLAUDE.md`.   | All tools                                   | sonnet |
| `/ship`       | (pipeline)     | Full PM → developer → tester pipeline for non-trivial changes.                        | —                                           | —      |

## How to invoke

From the Claude Code prompt:

```
/pm add scheduled scans to Kavach
/dev fix Jira health probe caching bug
/tester verify the new Kavach plain-English drawer tabs
/ship add CSV export to Kavach reports
```

Or call the `Agent` tool directly with `subagent_type: "product-manager" | "tester" | "developer"`.

## Why three agents instead of one

Each role has a different blast radius:

- **PM** is read-only — reads CLAUDE.md and a handful of files, then writes a spec. Cheap.
- **Tester** runs commands and reads diffs but cannot edit production code. Bugs surface as reports, not patches.
- **Developer** is the only role that can change production code. Always invoked with a clear spec, never with a vague ask.

This separation:

1. **Saves tokens** — the PM doesn't load the full codebase; the tester doesn't load build chains; the developer doesn't load product reasoning prompts.
2. **Saves money** — read-only agents stay on cheaper models; only writes go to higher-context flows.
3. **Catches mistakes early** — the tester is a separate brain that wasn't biased by the developer's plan.
4. **Makes work auditable** — the spec, the diff, and the test plan are three artifacts on disk, not a single sprawling chat.

## Coding standards

The agents enforce the rules in:

- `CLAUDE.md` (top-level)
- `backend/CLAUDE.md`
- `frontend/CLAUDE.md`
- Per-tool `CLAUDE.md` under `backend/internal/tools/<slug>/` and `frontend/src/tools/<slug>/`

Read those before working in this repo.

## File layout

```
.claude/
├── README.md            this file
├── agents/              subagent definitions (frontmatter + system prompt)
│   ├── product-manager.md
│   ├── tester.md
│   └── developer.md
└── commands/            slash commands that invoke the agents
    ├── pm.md
    ├── tester.md
    ├── dev.md
    └── ship.md
```

## Editing an agent

1. Update the frontmatter (`name`, `description`, `model`, `tools`) and the system prompt body in `.claude/agents/<name>.md`.
2. Restart the Claude Code session so the new definition loads.
3. Don't widen `tools:` without a reason — the smaller the toolset, the cheaper and safer the agent.

## Editing a slash command

`.claude/commands/<name>.md` — the body is the prompt to inject. `$ARGUMENTS` is replaced with whatever the user typed after the slash command. Keep slash commands thin: they should orchestrate, not contain detailed instructions (those belong in the agent's system prompt).
