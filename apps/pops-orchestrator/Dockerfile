# DO NOT EDIT blindly — hand-written for the cross-pillar orchestrator
# (@pops/orchestrator, ADR-029 epics 06+07). Mirrors the collapsed-pillar
# build shape (pillars/cerebrum/Dockerfile): scope the install + build to
# the @pops/orchestrator subgraph so unrelated pillars never enter this
# image's context. Keep it narrow: only @pops/orchestrator and its

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/orchestrator + its transitive @pops/* deps.
# `pnpm install --filter "@pops/orchestrator..."` scopes lockfile
# resolution to that subgraph; unrelated pillars never need to exist in
# this image's build context.
COPY apps/pops-orchestrator/package.json ./apps/pops-orchestrator/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/types/package.json ./packages/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/orchestrator..."

# Phase 2: source for the transitive @pops/* deps + the app itself.
# @pops/pillar-sdk
COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json
# @pops/types
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json
# @pops/orchestrator (the app itself)
COPY apps/pops-orchestrator/src ./apps/pops-orchestrator/src
COPY apps/pops-orchestrator/tsconfig.json ./apps/pops-orchestrator/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the app.
RUN pnpm --filter "@pops/orchestrator^..." build
RUN pnpm --filter "@pops/orchestrator" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/orchestrator deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/apps/pops-orchestrator/dist ./dist

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3009
USER node
CMD ["node", "dist/server.js"]
