# syntax=docker/dockerfile:1
# sr2e-chargen (docs/PLAN-M3.md §8). Build from the repo root:  docker build -f docker/Dockerfile -t sr2e-chargen:dev .
# The image builds its own catalog from content/ (the project's copy of the content, kept by npm run content:sync).
# Both bases are pinned by digest (checked 2026-11-16); bump the tag and digest together.

# --- build: the client, and the server's production dependencies (no install scripts: .npmrc) ---
FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
# The rules the client and server both run (docs/PLAN-M2.md §1): shared/ imports the system's code from content/.
COPY content-pins.json ./
COPY content ./content
COPY shared ./shared
COPY vite.config.mjs ./
COPY client ./client
RUN npm run build
# The catalog (docs/PLAN-catalog.md, Amendment A4): built HERE from the project's own copy of the content (content/),
# which the build checks against its record and the pins; then checked again. A build without valid content fails.
COPY tools ./tools
COPY server ./server
RUN node tools/build-catalog.mjs catalog && node tools/check-catalog.mjs catalog
RUN npm ci --omit=dev && mkdir /data /backups

# --- run: distroless (no shell, no package manager), non-root, only /data writable ---
FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:1d736cf8b5716c07a245301f92717143215d248fd55771ee1936ef4b3302e531
ENV NODE_ENV=production DATABASE_URL=sqlite:///data/chargen.db PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /data /data
# The backup volume's mount point, owned by the app user so a fresh named volume is writable (r1 #1).
COPY --from=build --chown=nonroot:nonroot /backups /backups
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/catalog ./catalog
COPY --from=build /app/content/sr2e-foundryvtt/module ./content/sr2e-foundryvtt/module
COPY --from=build /app/content/sr2e-foundryvtt/lang ./content/sr2e-foundryvtt/lang
COPY --from=build /app/content/sr2e-foundryvtt/assets/pregen_portraits ./content/sr2e-foundryvtt/assets/pregen_portraits
COPY package.json ./
COPY shared ./shared
COPY server ./server
USER nonroot
VOLUME ["/data"]
# Links the GHCR package to this (private) repository.
LABEL org.opencontainers.image.source="https://github.com/futurekill/sr2e-chargen"
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["/nodejs/bin/node", "server/healthcheck.mjs"]
# The admin CLI is the same image:  docker compose exec chargen /nodejs/bin/node server/cli.mjs admin bootstrap
CMD ["server/main.mjs"]
