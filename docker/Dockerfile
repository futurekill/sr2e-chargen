# syntax=docker/dockerfile:1
# sr2e-chargen (docs/PLAN-M3.md §8). Build from the repo root:  docker build -f docker/Dockerfile -t sr2e-chargen:dev .
# Both bases are pinned by digest (checked 2026-11-16); bump the tag and digest together.

# --- build: the client, and the server's production dependencies (no install scripts: .npmrc) ---
FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY vite.config.mjs ./
COPY client ./client
RUN npm run build
RUN npm ci --omit=dev && mkdir /data

# --- run: distroless (no shell, no package manager), non-root, only /data writable ---
FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:1d736cf8b5716c07a245301f92717143215d248fd55771ee1936ef4b3302e531
ENV NODE_ENV=production DATABASE_URL=sqlite:///data/chargen.db PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /data /data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
USER nonroot
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["/nodejs/bin/node", "server/healthcheck.mjs"]
# The admin CLI is the same image:  docker compose exec chargen /nodejs/bin/node server/cli.mjs admin bootstrap
CMD ["server/main.mjs"]
