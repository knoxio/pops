FROM node:22-alpine AS builder
WORKDIR /app

# The shell composes every pillar app (`@pops/app-*`), and those apps import
# contract/dsl types from their pillar packages (`@pops/finance`,
# `@pops/food/dsl`, …). The full workspace closure of `@pops/shell` therefore
# spans most of `libs/*` plus every `pillars/*` contract. Rather than
# hand-list ~20 COPY blocks (which drift every time the migration reshapes a
# package), copy the whole workspace and let pnpm's `--filter "@pops/shell..."`
# scope install + build to the real subgraph. `.dockerignore` keeps
# node_modules/dist/.git out of the context, and this builder stage is
# discarded — only `pillars/shell/dist` reaches the nginx image — so the
# wider copy adds no weight to the published artifact.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./
COPY libs/ ./libs/
COPY pillars/ ./pillars/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/shell..."

# Build the shell's workspace dependencies (pillars + shared packages) in
# pnpm topological order, then the shell itself (tsc typecheck + vite build).
RUN pnpm --filter "@pops/shell^..." build

WORKDIR /app/pillars/shell
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION
RUN pnpm build

# Bundle the registry render + watcher CLIs into standalone ESM (PRD-255
# US-02/US-03). esbuild inlines `@pops/pillar-sdk` + its closure so the
# production nginx image runs them with a bare node binary and no
# `node_modules` — see scripts/bundle-nginx-tools.ts.
RUN pnpm gen:nginx:bundle

# ── Production image ──────────────────────────────────────────────
FROM nginx:alpine

# Node runtime for the boot-render + watcher bundles. Pinned to the alpine
# package so `apk add` stays reproducible across rebuilds of the same base.
RUN apk add --no-cache nodejs

COPY --from=builder /app/pillars/shell/dist /usr/share/nginx/html

# The committed static conf is the BOOT FALLBACK (PRD-255 US-02): the
# entrypoint renders from the live registry first and only falls back to
# this baked copy when the registry is unreachable. It is staged under
# /etc/nginx/fallback/ AND installed at the served path so the image still
# boots a valid conf even before the entrypoint runs.
COPY pillars/shell/nginx.conf /etc/nginx/fallback/default.conf
COPY pillars/shell/nginx.conf /etc/nginx/conf.d/default.conf

# Shared proxy partial (Theme 13 PRD-190). Installed to /etc/nginx/snippets/
# rather than /etc/nginx/conf.d/ because nginx auto-loads every `*.conf`
# under `conf.d/` as a top-level server block — a partial dropped there
# would crash boot. The source path stays under `nginx/conf.d/` per the
# PRD's repo-layout rule.
COPY pillars/shell/nginx/conf.d/_pillar-proxy.conf /etc/nginx/snippets/_pillar-proxy.conf

# Boot-render + watcher bundles and the supervising entrypoint (PRD-255).
COPY --from=builder /app/pillars/shell/dist-scripts/render-nginx-conf.mjs /opt/pops-shell/render-nginx-conf.mjs
COPY --from=builder /app/pillars/shell/dist-scripts/watch-registry-and-reload.mjs /opt/pops-shell/watch-registry-and-reload.mjs
COPY pillars/shell/docker-entrypoint.sh /opt/pops-shell/docker-entrypoint.sh
RUN chmod +x /opt/pops-shell/docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/opt/pops-shell/docker-entrypoint.sh"]
