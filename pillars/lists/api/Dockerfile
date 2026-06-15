# DO NOT EDIT — regenerate with:
#   node scripts/generate-pillar-dockerfile.mjs lists
# CI drift-check (.github/workflows/docker-build.yml) fails on hand-edits.
# PRD-252 / audit H-D1.

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: only the package.json of @pops/lists-api and its transitive
# @pops/* deps. `pnpm install --filter "@pops/lists-api..."` (below)
# scopes the lockfile resolution to that subgraph, so unrelated
# pillars never need to be present in this image's build context
# (audit follow-up to PRD-253 — kills the "every pillar's package.json
# in every pillar's image" coupling).
COPY packages/cerebrum-contract/package.json ./packages/cerebrum-contract/
COPY packages/core-contract/package.json ./packages/core-contract/
COPY packages/finance-contract/package.json ./packages/finance-contract/
COPY packages/inventory-contract/package.json ./packages/inventory-contract/
COPY packages/media-contract/package.json ./packages/media-contract/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/types/package.json ./packages/types/
COPY pillars/lists/api/package.json ./pillars/lists/api/
COPY pillars/lists/app-db-legacy/package.json ./pillars/lists/app-db-legacy/
COPY pillars/lists/db/package.json ./pillars/lists/db/

# Install pnpm + only the deps of the @pops/lists-api subgraph.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/lists-api..."

# Phase 2: sources for the transitive @pops/* deps of @pops/lists-api
# (resolved via `pnpm m ls --filter "@pops/lists-api..." --json`).
# A change in a non-listed package does NOT invalidate this image's
# Phase 2 layer.
# @pops/cerebrum-contract
COPY packages/cerebrum-contract/src ./packages/cerebrum-contract/src
COPY packages/cerebrum-contract/scripts ./packages/cerebrum-contract/scripts
COPY packages/cerebrum-contract/openapi ./packages/cerebrum-contract/openapi
COPY packages/cerebrum-contract/tsconfig.json ./packages/cerebrum-contract/tsconfig.json
# @pops/core-contract
COPY packages/core-contract/src ./packages/core-contract/src
COPY packages/core-contract/scripts ./packages/core-contract/scripts
COPY packages/core-contract/openapi ./packages/core-contract/openapi
COPY packages/core-contract/tsconfig.json ./packages/core-contract/tsconfig.json
# @pops/finance-contract
COPY packages/finance-contract/src ./packages/finance-contract/src
COPY packages/finance-contract/scripts ./packages/finance-contract/scripts
COPY packages/finance-contract/openapi ./packages/finance-contract/openapi
COPY packages/finance-contract/tsconfig.json ./packages/finance-contract/tsconfig.json
# @pops/inventory-contract
COPY packages/inventory-contract/src ./packages/inventory-contract/src
COPY packages/inventory-contract/scripts ./packages/inventory-contract/scripts
COPY packages/inventory-contract/openapi ./packages/inventory-contract/openapi
COPY packages/inventory-contract/tsconfig.json ./packages/inventory-contract/tsconfig.json
# @pops/media-contract
COPY packages/media-contract/src ./packages/media-contract/src
COPY packages/media-contract/scripts ./packages/media-contract/scripts
COPY packages/media-contract/openapi ./packages/media-contract/openapi
COPY packages/media-contract/tsconfig.json ./packages/media-contract/tsconfig.json
# @pops/pillar-sdk
COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json
# @pops/types
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json
# @pops/app-lists-db
COPY pillars/lists/app-db-legacy/src ./pillars/lists/app-db-legacy/src
COPY pillars/lists/app-db-legacy/tsconfig.json ./pillars/lists/app-db-legacy/tsconfig.json
# @pops/lists-db
COPY pillars/lists/db/src ./pillars/lists/db/src
COPY pillars/lists/db/migrations ./pillars/lists/db/migrations
COPY pillars/lists/db/tsconfig.json ./pillars/lists/db/tsconfig.json

# Pillar app sources.
COPY pillars/lists/api/src ./pillars/lists/api/src
COPY pillars/lists/api/tsconfig.json ./pillars/lists/api/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the app.
# `^...` expands to every dependency of the target excluding the target,
# letting pnpm compute build order from the lockfile (see #3285).
RUN pnpm --filter "@pops/lists-api^..." build
RUN pnpm --filter "@pops/lists-api" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/lists-api deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/lists/api/dist ./dist

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3001
USER node
CMD ["node", "dist/server.js"]
