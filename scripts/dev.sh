#!/usr/bin/env bash
# APIStress — one-command local dev runner.
# Starts: Postgres (Docker) + backend (go run) + frontend (vite).
# Ctrl+C stops all three cleanly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GREEN='\033[1;32m'; CYAN='\033[1;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'

# --- Postgres ---
if ! docker ps --filter name=choicehammer_postgres --format '{{.Names}}' | grep -q .; then
  echo -e "${CYAN}» starting Postgres in Docker…${RESET}"
  docker start choicehammer_postgres >/dev/null 2>&1 || \
    docker run -d --name choicehammer_postgres \
      -e POSTGRES_USER=choicehammer -e POSTGRES_PASSWORD=choicehammer -e POSTGRES_DB=choicehammer \
      -p 5434:5432 -v choicehammer_pgdata:/var/lib/postgresql/data \
      postgres:16-alpine >/dev/null
  until docker exec choicehammer_postgres pg_isready -U choicehammer >/dev/null 2>&1; do sleep 1; done
fi
echo -e "${GREEN}✓ Postgres ready on :5434${RESET}"

# --- Frontend deps (only first time) ---
if [[ ! -d frontend/node_modules ]]; then
  echo -e "${CYAN}» installing frontend deps (one-off)…${RESET}"
  ( cd frontend && npm install --no-audit --no-fund )
fi

# --- Trap to clean up on exit ---
PIDS=()
cleanup() {
  echo -e "\n${YELLOW}» shutting down…${RESET}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo -e "${GREEN}✓ stopped${RESET}"
}
trap cleanup EXIT INT TERM

# --- Backend ---
echo -e "${CYAN}» starting backend on :8088…${RESET}"
( cd backend && \
  CH_HTTP_ADDR=:8088 \
  CH_POSTGRES_DSN='postgres://choicehammer:choicehammer@localhost:5434/choicehammer?sslmode=disable' \
  CH_ACCESS_KEY='choicehammer-dev-key' \
  CH_LOG_DIR=./logs CH_LOG_LEVEL=info CH_LOG_PRETTY=true \
  go run ./cmd/server ) &
PIDS+=($!)

# --- Frontend ---
echo -e "${CYAN}» starting frontend on :5173…${RESET}"
( cd frontend && \
  VITE_API_URL=http://localhost:8088 \
  npm run dev -- --host ) &
PIDS+=($!)

cat <<EOF

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}
  APIStress dev stack is up.

  Frontend  :  ${CYAN}http://localhost:5173${RESET}
  Backend   :  ${CYAN}http://localhost:8088${RESET}
  Postgres  :  ${CYAN}localhost:5434${RESET}

  Login key :  ${YELLOW}choicehammer-dev-key${RESET}

  Press Ctrl+C to stop everything.
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}

EOF

wait
