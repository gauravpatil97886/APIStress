# PostWomen — backend

Postman-style API client. Workspaces → collections → requests, plus history and a Postman-compatible import / export.

## Layout

```
internal/tools/postwomen/
├── store/                 # package postwomen
│   ├── types.go           # Workspace, Collection, Request, RequestSpec, etc.
│   ├── executor.go        # Send(ctx, RequestSpec) — the actual HTTP call
│   ├── postman_import.go  # Postman 2.1 collection JSON → store types
│   └── postman_export.go  # store types → Postman 2.1 JSON
└── handlers/              # package postwomen — registers /api/postwomen/* routes
```

## Multi-tenancy

Every workspace row carries `team_id`. Collections and requests are scoped **transitively** through their workspace's `team_id` — handlers do an ownership-by-workspace check before any read/update/delete:

```sql
SELECT 1 FROM pw_workspaces w
 JOIN pw_collections c ON c.workspace_id = w.id
 WHERE c.id = $1 AND w.team_id = $2;
```

Failure ⇒ 404 (not 403 — never leak existence).

## Endpoints (under `/api/postwomen/...` in the protected group)

- `GET    /workspaces`
- `POST   /workspaces`
- `DELETE /workspaces/:id`
- `GET    /workspaces/:id/tree`              — collections + requests
- `POST   /collections`
- `PATCH  /collections/:id`
- `DELETE /collections/:id`
- `POST   /requests`
- `PUT    /requests/:id`
- `DELETE /requests/:id`
- `POST   /send`                             — execute a RequestSpec, return response + duration
- `POST   /import`                           — Postman 2.1 collection
- `GET    /export/:id`                       — Postman 2.1 collection
- `GET    /history`                          — recent sends, optionally per-workspace

## Send

`store.Send(ctx, RequestSpec)` is a thin wrapper around `http.Client` that:
- substitutes `{{var}}` from the supplied environment map (URL, headers, query, body),
- supports raw / json / form-urlencoded / multipart bodies,
- captures status, duration, bytes received, response headers, and a (possibly truncated) body preview.

The frontend Runner (PostWomen → Runner) calls this same endpoint per row of its dataset.

## History

Default behaviour writes one `pw_history` row per send. The Runner toggles this off by default — a 5-lakh-row run otherwise floods the table. Both branches honour `team_id`.

## Tool isolation

- May import from `platform/` (logger, jira, teams, storage).
- Must NOT import from `tools/apistress/*` or `tools/kavach/*`. If the need arises, lift the helper into `platform/`.
