# DO NOT EDIT — regenerate with:
#   node scripts/generate-pillar-dockerfile.mjs core
# CI drift-check (.github/workflows/docker-build.yml) fails on hand-edits.
# PRD-252 / audit H-D1.

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: only the package.json of @pops/core-api and its transitive
# @pops/* deps. `pnpm install --filter "@pops/core-api..."` (below)
# scopes the lockfile resolution to that subgraph, so unrelated
# pillars never need to be present in this image's build context
# (audit follow-up to PRD-253 — kills the "every pillar's package.json
# in every pillar's image" coupling).
COPY apps/pops-core-api/package.json ./apps/pops-core-api/
COPY packages/core-contract/package.json ./packages/core-contract/
COPY packages/core-db/package.json ./packages/core-db/
COPY packages/finance-contract/package.json ./packages/finance-contract/
COPY packages/inventory-contract/package.json ./packages/inventory-contract/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/types/package.json ./packages/types/
COPY packages/wire-conformance/package.json ./packages/wire-conformance/

# Install pnpm + only the deps of the @pops/core-api subgraph.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/core-api..."

# Phase 2: sources for the transitive @pops/* deps of @pops/core-api
# (resolved via `pnpm m ls --filter "@pops/core-api..." --json`).
# A change in a non-listed package does NOT invalidate this image's
# Phase 2 layer.
# @pops/core-contract
COPY packages/core-contract/src ./packages/core-contract/src
COPY packages/core-contract/scripts ./packages/core-contract/scripts
COPY packages/core-contract/openapi ./packages/core-contract/openapi
COPY packages/core-contract/tsconfig.json ./packages/core-contract/tsconfig.json
# @pops/core-db
COPY packages/core-db/src ./packages/core-db/src
COPY packages/core-db/migrations ./packages/core-db/migrations
COPY packages/core-db/tsconfig.json ./packages/core-db/tsconfig.json
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
# @pops/pillar-sdk
COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json
# @pops/types
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json
# @pops/wire-conformance
COPY packages/wire-conformance/src ./packages/wire-conformance/src
COPY packages/wire-conformance/tsconfig.json ./packages/wire-conformance/tsconfig.json
COPY packages/wire-conformance/tsconfig.build.json ./packages/wire-conformance/tsconfig.build.json

# Pillar app sources.
COPY apps/pops-core-api/src ./apps/pops-core-api/src
COPY apps/pops-core-api/tsconfig.json ./apps/pops-core-api/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the app.
# `^...` expands to every dependency of the target excluding the target,
# letting pnpm compute build order from the lockfile (see #3285).
RUN pnpm --filter "@pops/core-api^..." build
RUN pnpm --filter "@pops/core-api" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/core-api deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/apps/pops-core-api/dist ./dist

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3001
USER node
CMD ["node", "dist/server.js"]
