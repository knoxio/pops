FROM node:22-alpine AS builder
WORKDIR /app

# The shell composes every pillar app (`@pops/app-*`), and those apps import
# contract/dsl types from their pillar packages (`@pops/finance`,
# `@pops/food/dsl`, …). The full workspace closure of `@pops/shell` therefore
# spans most of `packages/*` plus every `pillars/*` contract. Rather than
# hand-list ~20 COPY blocks (which drift every time the migration reshapes a
# package), copy the whole workspace and let pnpm's `--filter "@pops/shell..."`
# scope install + build to the real subgraph. `.dockerignore` keeps
# node_modules/dist/.git out of the context, and this builder stage is
# discarded — only `apps/pops-shell/dist` reaches the nginx image — so the
# wider copy adds no weight to the published artifact.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./
COPY packages/ ./packages/
COPY pillars/ ./pillars/
COPY apps/pops-shell/ ./apps/pops-shell/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/shell..."

# Build the shell's workspace dependencies (pillars + shared packages) in
# pnpm topological order, then the shell itself (tsc typecheck + vite build).
RUN pnpm --filter "@pops/shell^..." build

WORKDIR /app/apps/pops-shell
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION
RUN pnpm build

# ── Production image ──────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/apps/pops-shell/dist /usr/share/nginx/html
COPY apps/pops-shell/nginx.conf /etc/nginx/conf.d/default.conf
# Shared proxy partial (Theme 13 PRD-190). Installed to /etc/nginx/snippets/
# rather than /etc/nginx/conf.d/ because nginx auto-loads every `*.conf`
# under `conf.d/` as a top-level server block — a partial dropped there
# would crash boot. The source path stays under `nginx/conf.d/` per the
# PRD's repo-layout rule.
COPY apps/pops-shell/nginx/conf.d/_pillar-proxy.conf /etc/nginx/snippets/_pillar-proxy.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
