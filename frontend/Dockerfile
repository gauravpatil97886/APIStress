# syntax=docker/dockerfile:1.7

# ─── Build stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Install deps from a clean lockfile when available; falls back to npm install
# so dev environments without an up-to-date lockfile still build.
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi

# Build the app. VITE_API_URL is baked at build time, so it's a build arg.
ARG VITE_API_URL=http://localhost:8080
ENV VITE_API_URL=${VITE_API_URL}

COPY . .
RUN npm run build

# ─── Runtime stage ───────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Drop default config; ours handles SPA routing + caching.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
