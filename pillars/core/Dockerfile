# DO NOT EDIT — hand-written for the collapsed core pillar.
# The pillar Dockerfile generator does not yet understand the collapsed shape —
# until it does, this file is maintained manually. Keep it narrow: only
# @pops/core and its transitive @pops/* deps (queried via
# `pnpm m ls --filter "@pops/core..." --json --depth -1`):
# cerebrum-contract, cerebrum-db, core-contract, pillar-sdk, types.
#
# NOTE: not build-verified in the authoring environment (no Docker available);
# cloned 1:1 from pillars/finance/Dockerfile with the core dep set + port 3001.

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/core + its transitive @pops/* deps.
COPY pillars/core/package.json ./pillars/core/
COPY packages/cerebrum-contract/package.json ./packages/cerebrum-contract/
COPY packages/cerebrum-db/package.json ./packages/cerebrum-db/
COPY packages/core-contract/package.json ./packages/core-contract/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/types/package.json ./packages/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/core..."

# Phase 2: source for the transitive @pops/* deps, then the pillar itself.
COPY packages/cerebrum-contract/src ./packages/cerebrum-contract/src
COPY packages/cerebrum-contract/scripts ./packages/cerebrum-contract/scripts
COPY packages/cerebrum-contract/openapi ./packages/cerebrum-contract/openapi
COPY packages/cerebrum-contract/tsconfig.json ./packages/cerebrum-contract/tsconfig.json

COPY packages/cerebrum-db/src ./packages/cerebrum-db/src
COPY packages/cerebrum-db/migrations ./packages/cerebrum-db/migrations
COPY packages/cerebrum-db/tsconfig.json ./packages/cerebrum-db/tsconfig.json

COPY packages/core-contract/src ./packages/core-contract/src
COPY packages/core-contract/scripts ./packages/core-contract/scripts
COPY packages/core-contract/openapi ./packages/core-contract/openapi
COPY packages/core-contract/tsconfig.json ./packages/core-contract/tsconfig.json

COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json

COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json

COPY pillars/core/src ./pillars/core/src
COPY pillars/core/scripts ./pillars/core/scripts
COPY pillars/core/openapi ./pillars/core/openapi
COPY pillars/core/migrations ./pillars/core/migrations
COPY pillars/core/tsconfig.json ./pillars/core/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/core^..." build
RUN pnpm --filter "@pops/core" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/core deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/core/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/core/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3001
USER node
CMD ["node", "dist/api/server.js"]
