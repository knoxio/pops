# DO NOT EDIT — hand-written for the collapsed lists pillar pilot.
# The pillar Dockerfile generator (scripts/generate-pillar-dockerfile.mjs)
# does not yet understand the collapsed shape — until it does, this file
# is maintained manually. Keep Phase 1 narrow: only @pops/lists and its
# transitive @pops/* deps (queried via
# `pnpm m ls --filter "@pops/lists..." --json --depth -1`).

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/lists + its transitive @pops/* deps.
# `pnpm install --filter "@pops/lists..."` (below) scopes lockfile
# resolution to that subgraph; unrelated pillars never need to exist
# in this image's build context.
COPY pillars/lists/package.json ./pillars/lists/
COPY packages/cerebrum-contract/package.json ./packages/cerebrum-contract/
COPY packages/core-contract/package.json ./packages/core-contract/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/types/package.json ./packages/types/

# Install pnpm + only the deps of the @pops/lists subgraph.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/lists..."

# Phase 2: source for the transitive @pops/* deps of @pops/lists.
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
# @pops/pillar-sdk
COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json
# @pops/types
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json
# @pops/lists (the pillar itself)
COPY pillars/lists/src ./pillars/lists/src
COPY pillars/lists/scripts ./pillars/lists/scripts
COPY pillars/lists/openapi ./pillars/lists/openapi
COPY pillars/lists/migrations ./pillars/lists/migrations
COPY pillars/lists/tsconfig.json ./pillars/lists/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/lists^..." build
RUN pnpm --filter "@pops/lists" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/lists deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/lists/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/lists/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3006
USER node
CMD ["node", "dist/api/server.js"]
