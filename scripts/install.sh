#!/usr/bin/env bash
# APIStress — one-command installer.
#
# Curl-pipe friendly:
#   curl -fsSL https://raw.githubusercontent.com/choicetechlab/choicehammer/main/scripts/install.sh | bash
#
# Or after a clone:
#   ./scripts/install.sh
#
# What it does:
#   1. Verifies Docker + Docker Compose are present.
#   2. Creates .env from .env.example (only if missing).
#   3. Generates a random CH_ACCESS_KEY (only if you didn't already set one).
#   4. Runs `docker compose up --build -d`.
#   5. Waits for the backend's /healthz to come up.
#   6. Prints the URL + access key, ready to use.
set -euo pipefail

GREEN='\033[1;32m'; RED='\033[1;31m'; YELLOW='\033[1;33m'; BLUE='\033[1;34m'; DIM='\033[2m'; RESET='\033[0m'
say()  { echo -e "${BLUE}»${RESET} $*"; }
ok()   { echo -e "${GREEN}✓${RESET} $*"; }
warn() { echo -e "${YELLOW}!${RESET} $*"; }
die()  { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }

banner() {
  cat <<'EOF'

      █████╗ ██████╗ ██╗ ███████╗████████╗██████╗ ███████╗███████╗███████╗
     ██╔══██╗██╔══██╗██║ ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██╔════╝██╔════╝
     ███████║██████╔╝██║ ███████╗   ██║   ██████╔╝█████╗  ███████╗███████╗
     ██╔══██║██╔═══╝ ██║ ╚════██║   ██║   ██╔══██╗██╔══╝  ╚════██║╚════██║
     ██║  ██║██║     ██║ ███████║   ██║   ██║  ██║███████╗███████║███████║
     ╚═╝  ╚═╝╚═╝     ╚═╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝

                Choice Techlab Internal Tools
                       For internal organisation use only

EOF
}

banner

# Resolve repo root: prefer caller's CWD if it has docker-compose.yml.
ROOT="$(pwd)"
if [[ ! -f "$ROOT/docker-compose.yml" ]]; then
  # Fall back to the script's grandparent (when run via curl-pipe we can't).
  if [[ -n "${BASH_SOURCE[0]:-}" && -f "$(dirname "${BASH_SOURCE[0]}")/../docker-compose.yml" ]]; then
    ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  fi
fi
cd "$ROOT" || die "Run this script from the apistress repo root."
[[ -f docker-compose.yml ]] || die "docker-compose.yml not found. Are you in the apistress repo?"

say "Checking prerequisites…"
command -v docker >/dev/null || die "Docker is not installed. Install from https://docs.docker.com/get-docker/"
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null; then
  COMPOSE="docker-compose"
else
  die "Docker Compose is not installed. Get the v2 plugin: https://docs.docker.com/compose/install/"
fi
ok "Docker and Compose found ($COMPOSE)."

say "Setting up .env…"
if [[ ! -f .env ]]; then
  cp .env.example .env
  ok "Copied .env.example → .env"
fi

# Replace dev key with a random one if it's still the default.
if grep -q '^CH_ACCESS_KEY=choicehammer-dev-key' .env; then
  if command -v openssl >/dev/null; then
    NEW_KEY="$(openssl rand -hex 24)"
  else
    NEW_KEY="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"
  fi
  # cross-platform sed in-place
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^CH_ACCESS_KEY=.*|CH_ACCESS_KEY=$NEW_KEY|" .env
  else
    sed -i "s|^CH_ACCESS_KEY=.*|CH_ACCESS_KEY=$NEW_KEY|" .env
  fi
  ok "Generated a fresh access key."
fi

ACCESS_KEY="$(grep '^CH_ACCESS_KEY=' .env | cut -d= -f2-)"

say "Building containers (first run takes ~2 minutes)…"
$COMPOSE up --build -d

say "Waiting for the backend to come up…"
HEALTH_URL="http://localhost:8080/healthz"
for i in $(seq 1 60); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    ok "Backend is healthy."
    break
  fi
  printf "${DIM}  …${RESET}\r"
  sleep 1
  if [[ $i -eq 60 ]]; then
    die "Backend did not come up within 60s. Run \`$COMPOSE logs backend\` for details."
  fi
done

cat <<EOF

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}
  ${GREEN}APIStress is up.${RESET}

  Frontend  :  ${BLUE}http://localhost:5173${RESET}
  Backend   :  ${BLUE}http://localhost:8080${RESET}
  Postgres  :  ${BLUE}localhost:5432${RESET}  (user/pass: choicehammer/choicehammer)

  Access key:  ${YELLOW}${ACCESS_KEY}${RESET}
  ${DIM}(stored in .env — share with anyone you want to give access)${RESET}

  Stop everything    :  ${DIM}$COMPOSE down${RESET}
  Stop & wipe data   :  ${DIM}$COMPOSE down -v${RESET}
  Tail backend logs  :  ${DIM}$COMPOSE logs -f backend${RESET}
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}

EOF
