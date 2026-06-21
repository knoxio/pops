# DO NOT EDIT — hand-written for the ai pillar.
# Keep it narrow: only @pops/ai and its transitive @pops/* deps
# (@pops/ai-telemetry, @pops/pillar-sdk, @pops/pillar-settings, @pops/types),
# queried via `pnpm m ls --filter "@pops/ai..." --json --depth -1`.
#
# Mirrors pillars/core/Dockerfile with the ai dep set + port 3008, plus the
# @pops/ai-telemetry COPY block (the ingest route imports its record-schema).

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/ai + its transitive @pops/* deps.
COPY pillars/ai/package.json ./pillars/ai/
COPY packages/ai-telemetry/package.json ./packages/ai-telemetry/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/pillar-settings/package.json ./packages/pillar-settings/
COPY packages/types/package.json ./packages/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/ai..."

# Phase 2: source for the transitive @pops/* deps, then the pillar itself.

COPY packages/ai-telemetry/src ./packages/ai-telemetry/src
COPY packages/ai-telemetry/tsconfig.json ./packages/ai-telemetry/tsconfig.json

COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json

COPY packages/pillar-settings/src ./packages/pillar-settings/src
COPY packages/pillar-settings/tsconfig.json ./packages/pillar-settings/tsconfig.json

COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json

COPY pillars/ai/src ./pillars/ai/src
COPY pillars/ai/scripts ./pillars/ai/scripts
COPY pillars/ai/openapi ./pillars/ai/openapi
COPY pillars/ai/migrations ./pillars/ai/migrations
COPY pillars/ai/tsconfig.json ./pillars/ai/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/ai^..." build
RUN pnpm --filter "@pops/ai" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/ai deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/ai/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/ai/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3008
USER node
CMD ["node", "dist/api/server.js"]
