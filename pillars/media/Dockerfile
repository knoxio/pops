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
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/types/package.json ./packages/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/media..."

# Phase 2: source for the transitive @pops/* deps, then the pillar itself.


COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json

COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json

COPY pillars/media/src ./pillars/media/src
COPY pillars/media/scripts ./pillars/media/scripts
COPY pillars/media/openapi ./pillars/media/openapi
COPY pillars/media/migrations ./pillars/media/migrations
COPY pillars/media/tsconfig.json ./pillars/media/tsconfig.json

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
