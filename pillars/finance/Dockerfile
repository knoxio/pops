# DO NOT EDIT — hand-written for the collapsed finance pillar.
# The pillar Dockerfile generator (scripts/generate-pillar-dockerfile.mjs)
# does not yet understand the collapsed shape — until it does, this file
# is maintained manually. Keep it narrow: only @pops/finance and its
# transitive @pops/* deps (queried via
# `pnpm m ls --filter "@pops/finance..." --json --depth -1`).

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/finance + its transitive @pops/* deps.
# `pnpm install --filter "@pops/finance..."` (below) scopes lockfile
# resolution to that subgraph; unrelated pillars never need to exist in
# this image's build context.
COPY pillars/finance/package.json ./pillars/finance/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/types/package.json ./packages/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/finance..."

# Phase 2: source for the transitive @pops/* deps, then the pillar itself.


COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json

COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json

COPY pillars/finance/src ./pillars/finance/src
COPY pillars/finance/scripts ./pillars/finance/scripts
COPY pillars/finance/openapi ./pillars/finance/openapi
COPY pillars/finance/migrations ./pillars/finance/migrations
COPY pillars/finance/tsconfig.json ./pillars/finance/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/finance^..." build
RUN pnpm --filter "@pops/finance" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/finance deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/finance/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/finance/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3004
USER node
CMD ["node", "dist/api/server.js"]
