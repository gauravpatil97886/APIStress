# Contributing to APIStress

Thanks for considering a contribution! APIStress is an open-source load-testing tool — issues and PRs from the community are welcome.

## Quick links

- 🐛 [Report a bug](https://github.com/apistress/apistress/issues/new?template=bug.md)
- 💡 [Suggest a feature](https://github.com/apistress/apistress/issues/new?template=feature.md)
- 💬 [Discussions](https://github.com/apistress/apistress/discussions)

## Development setup

You need Go 1.22+, Node 20+, and Docker.

```bash
git clone https://github.com/apistress/apistress.git
cd apistress

# 1. Boot Postgres only (rest runs locally for hot-reload)
docker run -d --name ch-postgres \
  -e POSTGRES_USER=choicehammer -e POSTGRES_PASSWORD=choicehammer -e POSTGRES_DB=choicehammer \
  -p 5432:5432 postgres:16-alpine

# 2. Backend
cd backend
go mod tidy
CH_ACCESS_KEY=dev CH_HTTP_ADDR=:8080 \
CH_POSTGRES_DSN='postgres://choicehammer:choicehammer@localhost:5432/choicehammer?sslmode=disable' \
go run ./cmd/server

# 3. Frontend (in another terminal)
cd frontend && npm install && VITE_API_URL=http://localhost:8080 npm run dev
```

## Repo layout

```
apistress/
├── backend/              # Go service + CLI
│   ├── cmd/server/       # API + engine entry
│   ├── cmd/hammer/       # CLI entry
│   └── internal/         # Engine, protocols, metrics, report, api, storage, logger, config
├── frontend/             # React 18 + Vite + Tailwind
│   └── src/{pages,components,hooks,store,lib}
├── docker-compose.yml
└── Makefile
```

Each side has a `CLAUDE.md` with deeper architectural notes.

## Coding conventions

### Go
- `gofmt`, `go vet` must pass.
- Prefer small files. Engine code uses atomics on the hot path; do not introduce mutexes in `metrics.Collector` without a benchmark.
- No new dependencies without discussing in an issue first.

### TypeScript / React
- TypeScript `strict` mode is on; keep it that way.
- Tailwind utility classes preferred over CSS files. Custom design tokens live in [`frontend/tailwind.config.js`](frontend/tailwind.config.js).
- Animations: `framer-motion` for entrance/transitions, Tailwind keyframes for ambient.
- Charts: `recharts`. Theme overrides are in [`frontend/src/index.css`](frontend/src/index.css).

### Commits
Conventional Commits style is encouraged but not enforced:

```
feat(engine): add stages pattern
fix(report): sanitise unicode for gofpdf
docs: clarify CH_ACCESS_KEY rotation
```

## Pull-request checklist

Before opening a PR:

- [ ] `cd backend && go mod tidy && go build ./... && go vet ./...` — clean
- [ ] `cd frontend && npm run lint && npm run build` — clean
- [ ] `docker compose up --build` boots and the login page renders
- [ ] You can start a run, watch live metrics, and download the PDF
- [ ] If you touched the schema, add an idempotent migration to `backend/internal/storage/migrations/001_init.sql` (or add `002_*.sql`)
- [ ] If you touched the API, update the table in [`README.md`](README.md#api-reference-short-version)

PR title should describe the user-visible change in one sentence ("Add Slack alert when threshold breaches").

## Reporting security issues

Please **don't** open a public issue for security problems. Open a GitHub Security Advisory or email the maintainers privately.

## License

By submitting a contribution, you agree that it is licensed under the [MIT License](LICENSE).
