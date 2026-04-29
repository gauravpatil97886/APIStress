.PHONY: help install quickstart dev up down restart logs backend frontend tidy fmt lint cli build clean

help:                ## Show this help
	@echo "APIStress — make targets"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1;33m%-12s\033[0m %s\n", $$1, $$2}'

install:             ## Run the one-command installer (Docker + .env + boot)
	./scripts/install.sh

dev:                 ## Run Postgres + backend + frontend natively (Ctrl+C stops all)
	./scripts/dev.sh

quickstart: install  ## Alias for `install`

up:                  ## docker compose up --build
	docker compose up --build

down:                ## docker compose down (keeps DB volume)
	docker compose down

restart:             ## Down + up in one command
	docker compose down && docker compose up --build -d

logs:                ## Tail backend logs
	docker compose logs -f backend

backend:             ## Run backend natively (needs Postgres running locally)
	cd backend && go run ./cmd/server

frontend:            ## Run frontend Vite dev server
	cd frontend && npm install && npm run dev

tidy:                ## go mod tidy
	cd backend && go mod tidy

fmt:                 ## go fmt + prettier-equivalent
	cd backend && go fmt ./...
	cd frontend && npx prettier -w "src/**/*.{ts,tsx,css}" || true

lint:                ## go vet + tsc --noEmit
	cd backend && go vet ./...
	cd frontend && npm run lint

cli:                 ## Build the hammer CLI to ./bin/hammer
	cd backend && go build -o ../bin/hammer ./cmd/hammer
	@echo "→ ./bin/hammer ready"

build:               ## Build production binaries (server + cli) into ./bin
	cd backend && go build -o ../bin/server ./cmd/server && go build -o ../bin/hammer ./cmd/hammer
	cd frontend && npm install && npm run build
	@echo "→ ./bin/{server,hammer} and frontend/dist built"

clean:               ## Remove ./bin and frontend/dist
	rm -rf bin frontend/dist
