# DO NOT EDIT — hand-written for the collapsed media pillar.
# The pillar Dockerfile generator (scripts/generate-pillar-dockerfile.mjs)
# does not yet understand the collapsed shape — until it does, this file
# is maintained manually. Keep it narrow: only @pops/media and its
# transitive @pops/* deps (queried via
# `pnpm m ls --filter "@pops/media..." --json --depth -1`).

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/media + its transitive @pops/* deps.
# `pnpm install --filter "@pops/media..."` (below) scopes lockfile
# resolution to that subgraph; unrelated pillars never need to exist in
# this image's build context.
COPY pillars/media/package.json ./pillars/media/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/settings/package.json ./libs/settings/
COPY libs/types/package.json ./libs/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/media..."

# Phase 2: source for the transitive @pops/* deps, then the pillar itself.


COPY libs/sdk/src ./libs/sdk/src
COPY libs/sdk/tsconfig.json ./libs/sdk/tsconfig.json
COPY libs/sdk/tsconfig.build.json ./libs/sdk/tsconfig.build.json

COPY libs/settings/src ./libs/settings/src
COPY libs/settings/tsconfig.json ./libs/settings/tsconfig.json
COPY libs/settings/tsconfig.build.json ./libs/settings/tsconfig.build.json

COPY libs/types/src ./libs/types/src
COPY libs/types/tsconfig.json ./libs/types/tsconfig.json
COPY libs/types/tsconfig.build.json ./libs/types/tsconfig.build.json

COPY pillars/media/src ./pillars/media/src
COPY pillars/media/scripts ./pillars/media/scripts
COPY pillars/media/openapi ./pillars/media/openapi
COPY pillars/media/migrations ./pillars/media/migrations
COPY pillars/media/tsconfig.json ./pillars/media/tsconfig.json
COPY pillars/media/tsconfig.build.json ./pillars/media/tsconfig.build.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/media^..." build
RUN pnpm --filter "@pops/media" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/media deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/media/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/media/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3003
USER node
CMD ["node", "dist/api/server.js"]
