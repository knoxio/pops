# DO NOT EDIT — hand-written for the collapsed food pillar.
# Same shape as pillars/lists/Dockerfile but compiles to two CMDs:
# `node dist/api/server.js` (HTTP server) and `node dist/worker/worker.js`
# (BullMQ daemon). docker-compose selects the role per container; the
# IMAGE is shared.
#
# Phase 1 is narrow: only @pops/food and its transitive @pops/* deps
# (queried via `pnpm m ls --filter "@pops/food..." --json --depth -1`).
# `pnpm install --filter "@pops/food..."` scopes the lockfile resolution
# so unrelated pillars never need to be present.
#
# `@pops/types` requires tsconfig.build.json (lessons-learned from the
# lists Dockerfile).

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/food + its transitive @pops/* deps.
COPY pillars/food/package.json ./pillars/food/
COPY packages/core-contract/package.json ./packages/core-contract/
COPY packages/shared-schema/package.json ./packages/shared-schema/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/types/package.json ./packages/types/

# Install pnpm + only the deps of the @pops/food subgraph.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/food..."

# Phase 2: source for the transitive @pops/* deps of @pops/food.
# @pops/core-contract
COPY packages/core-contract/src ./packages/core-contract/src
COPY packages/core-contract/scripts ./packages/core-contract/scripts
COPY packages/core-contract/openapi ./packages/core-contract/openapi
COPY packages/core-contract/tsconfig.json ./packages/core-contract/tsconfig.json
# @pops/shared-schema
COPY packages/shared-schema/src ./packages/shared-schema/src
COPY packages/shared-schema/tsconfig.json ./packages/shared-schema/tsconfig.json
# @pops/pillar-sdk
COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json
# @pops/types
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json
# @pops/food (the pillar itself)
COPY pillars/food/src ./pillars/food/src
COPY pillars/food/scripts ./pillars/food/scripts
COPY pillars/food/openapi ./pillars/food/openapi
COPY pillars/food/migrations ./pillars/food/migrations
COPY pillars/food/tsconfig.json ./pillars/food/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/food^..." build
RUN pnpm --filter "@pops/food" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/food deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/food/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/food/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3005
USER node

# Default CMD runs the API server. docker-compose overrides this to
# `["node", "dist/worker/worker.js"]` for the worker container.
CMD ["node", "dist/api/server.js"]
