# DO NOT EDIT — hand-written for the collapsed cerebrum pillar.
# The pillar Dockerfile generator (scripts/generate-pillar-dockerfile.mjs)
# does not yet understand the collapsed shape — until it does, this file
# is maintained manually. Keep it narrow: only @pops/cerebrum and its
# transitive @pops/* deps (queried via
# `pnpm m ls --filter "@pops/cerebrum..." --json --depth -1`).

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/cerebrum + its transitive @pops/* deps.
# `pnpm install --filter "@pops/cerebrum..."` (below) scopes lockfile
# resolution to that subgraph; unrelated pillars never need to exist
# in this image's build context.
COPY pillars/cerebrum/package.json ./pillars/cerebrum/
COPY packages/ai-telemetry/package.json ./packages/ai-telemetry/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/pillar-settings/package.json ./packages/pillar-settings/
COPY packages/types/package.json ./packages/types/

# Install pnpm + only the deps of the @pops/cerebrum subgraph.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/cerebrum..."

# Phase 2: source for the transitive @pops/* deps of @pops/cerebrum.
# @pops/ai-telemetry
COPY packages/ai-telemetry/src ./packages/ai-telemetry/src
COPY packages/ai-telemetry/tsconfig.json ./packages/ai-telemetry/tsconfig.json
# @pops/pillar-sdk
COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json
# @pops/pillar-settings
COPY packages/pillar-settings/src ./packages/pillar-settings/src
COPY packages/pillar-settings/tsconfig.json ./packages/pillar-settings/tsconfig.json
# @pops/types
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json
# @pops/cerebrum (the pillar itself)
COPY pillars/cerebrum/src ./pillars/cerebrum/src
COPY pillars/cerebrum/scripts ./pillars/cerebrum/scripts
COPY pillars/cerebrum/openapi ./pillars/cerebrum/openapi
COPY pillars/cerebrum/migrations ./pillars/cerebrum/migrations
COPY pillars/cerebrum/tsconfig.json ./pillars/cerebrum/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/cerebrum^..." build
RUN pnpm --filter "@pops/cerebrum" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/cerebrum deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/cerebrum/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/cerebrum/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3007
USER node
CMD ["node", "dist/api/server.js"]
