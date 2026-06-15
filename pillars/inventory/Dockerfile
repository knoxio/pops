# DO NOT EDIT — hand-written for the collapsed inventory pillar.
# The pillar Dockerfile generator (scripts/generate-pillar-dockerfile.mjs)
# does not yet understand the collapsed shape — until it does, this file
# is maintained manually. Keep Phase 1 narrow: only @pops/inventory and its
# transitive @pops/* deps (queried via
# `pnpm m ls --filter "@pops/inventory..." --json --depth -1`).

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/inventory + its transitive @pops/* deps.
# `pnpm install --filter "@pops/inventory..."` (below) scopes lockfile
# resolution to that subgraph; unrelated pillars never need to exist
# in this image's build context.
COPY pillars/inventory/package.json ./pillars/inventory/
COPY packages/cerebrum-contract/package.json ./packages/cerebrum-contract/
COPY packages/core-contract/package.json ./packages/core-contract/
COPY packages/core-db/package.json ./packages/core-db/
COPY packages/finance-contract/package.json ./packages/finance-contract/
COPY packages/media-contract/package.json ./packages/media-contract/
COPY packages/media-db/package.json ./packages/media-db/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/types/package.json ./packages/types/

# Install pnpm + only the deps of the @pops/inventory subgraph.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/inventory..."

# Phase 2: source for the transitive @pops/* deps of @pops/inventory.
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
# @pops/core-db
COPY packages/core-db/src ./packages/core-db/src
COPY packages/core-db/migrations ./packages/core-db/migrations
COPY packages/core-db/tsconfig.json ./packages/core-db/tsconfig.json
# @pops/finance-contract
COPY packages/finance-contract/src ./packages/finance-contract/src
COPY packages/finance-contract/scripts ./packages/finance-contract/scripts
COPY packages/finance-contract/openapi ./packages/finance-contract/openapi
COPY packages/finance-contract/tsconfig.json ./packages/finance-contract/tsconfig.json
# @pops/media-contract
COPY packages/media-contract/src ./packages/media-contract/src
COPY packages/media-contract/scripts ./packages/media-contract/scripts
COPY packages/media-contract/openapi ./packages/media-contract/openapi
COPY packages/media-contract/tsconfig.json ./packages/media-contract/tsconfig.json
# @pops/media-db
COPY packages/media-db/src ./packages/media-db/src
COPY packages/media-db/migrations ./packages/media-db/migrations
COPY packages/media-db/tsconfig.json ./packages/media-db/tsconfig.json
# @pops/pillar-sdk
COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json
# @pops/types
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json
# @pops/inventory (the pillar itself)
COPY pillars/inventory/src ./pillars/inventory/src
COPY pillars/inventory/scripts ./pillars/inventory/scripts
COPY pillars/inventory/openapi ./pillars/inventory/openapi
COPY pillars/inventory/migrations ./pillars/inventory/migrations
COPY pillars/inventory/tsconfig.json ./pillars/inventory/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/inventory^..." build
RUN pnpm --filter "@pops/inventory" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/inventory deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/inventory/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/inventory/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3002
USER node
CMD ["node", "dist/api/server.js"]
