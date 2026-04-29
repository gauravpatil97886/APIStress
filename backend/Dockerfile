# syntax=docker/dockerfile:1.7

# ─── Build stage ─────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS build
WORKDIR /src

# Install build tools (git for VCS metadata, ca-certs for go modules over https).
RUN apk add --no-cache git ca-certificates

# Cache module downloads.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

# Copy source and build static binaries.
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server && \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/hammer ./cmd/hammer

# ─── Runtime stage ───────────────────────────────────────────────────────
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata wget && \
    addgroup -S choicehammer && adduser -S -G choicehammer choicehammer

WORKDIR /app
COPY --from=build /out/server /usr/local/bin/server
COPY --from=build /out/hammer /usr/local/bin/hammer

RUN mkdir -p /app/logs && chown -R choicehammer:choicehammer /app

ENV CH_HTTP_ADDR=":8080" \
    CH_LOG_DIR=/app/logs \
    CH_LOG_LEVEL=info \
    CH_LOG_PRETTY=false

USER choicehammer
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1

CMD ["server"]
