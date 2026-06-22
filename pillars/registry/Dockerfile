# DO NOT EDIT — hand-written for the registry pillar (formerly core).
# The pillar Dockerfile generator does not yet understand the collapsed shape —
# until it does, this file is maintained manually. Keep it narrow: only
# @pops/registry and its transitive @pops/* deps (queried via
# `pnpm m ls --filter "@pops/registry..." --json --depth -1`).
#
# NOTE: not build-verified in the authoring environment (no Docker available);
# mirrors pillars/finance/Dockerfile with the registry dep set + port 3001.

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/registry + its transitive @pops/* deps.
COPY pillars/registry/package.json ./pillars/registry/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/pillar-settings/package.json ./packages/pillar-settings/
COPY packages/types/package.json ./packages/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/registry..."

# Phase 2: source for the transitive @pops/* deps, then the pillar itself.

COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json

COPY packages/pillar-settings/src ./packages/pillar-settings/src
COPY packages/pillar-settings/tsconfig.json ./packages/pillar-settings/tsconfig.json

COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json

COPY pillars/registry/src ./pillars/registry/src
COPY pillars/registry/scripts ./pillars/registry/scripts
COPY pillars/registry/openapi ./pillars/registry/openapi
COPY pillars/registry/migrations ./pillars/registry/migrations
COPY pillars/registry/tsconfig.json ./pillars/registry/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/registry^..." build
RUN pnpm --filter "@pops/registry" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/registry deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/registry/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/registry/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3001
USER node
CMD ["node", "dist/api/server.js"]
