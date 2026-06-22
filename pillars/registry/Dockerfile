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
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/settings/package.json ./libs/settings/
COPY libs/types/package.json ./libs/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/registry..."

# Phase 2: source for the transitive @pops/* deps, then the pillar itself.

COPY libs/sdk/src ./libs/sdk/src
COPY libs/sdk/tsconfig.json ./libs/sdk/tsconfig.json

COPY libs/settings/src ./libs/settings/src
COPY libs/settings/tsconfig.json ./libs/settings/tsconfig.json

COPY libs/types/src ./libs/types/src
COPY libs/types/tsconfig.json ./libs/types/tsconfig.json
COPY libs/types/tsconfig.build.json ./libs/types/tsconfig.build.json

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
