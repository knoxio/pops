# DO NOT EDIT — regenerate with:
#   node scripts/generate-pillar-dockerfile.mjs inventory
# CI drift-check (.github/workflows/docker-build.yml) fails on hand-edits.
# PRD-252 / audit H-D1.

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: every workspace package.json. pnpm-workspace.yaml lists every
# member; if any are missing at install time pnpm fails with
# ERR_PNPM_WORKSPACE_PKG_NOT_FOUND. src/ + migrations/ for non-transitive
# packages are intentionally NOT copied (PRD-252 / audit H-D1).
COPY apps/pops-api/package.json ./apps/pops-api/
COPY apps/pops-cerebrum-api/package.json ./apps/pops-cerebrum-api/
COPY apps/pops-cli/package.json ./apps/pops-cli/
COPY apps/pops-core-api/package.json ./apps/pops-core-api/
COPY apps/pops-docs/package.json ./apps/pops-docs/
COPY apps/pops-finance-api/package.json ./apps/pops-finance-api/
COPY apps/pops-food-api/package.json ./apps/pops-food-api/
COPY apps/pops-ha-bridge-api/package.json ./apps/pops-ha-bridge-api/
COPY apps/pops-inventory-api/package.json ./apps/pops-inventory-api/
COPY apps/pops-lists-api/package.json ./apps/pops-lists-api/
COPY apps/pops-mcp/package.json ./apps/pops-mcp/
COPY apps/pops-media-api/package.json ./apps/pops-media-api/
COPY apps/pops-shell/package.json ./apps/pops-shell/
COPY apps/pops-storybook/package.json ./apps/pops-storybook/
COPY apps/pops-worker-food/package.json ./apps/pops-worker-food/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/app-ai/package.json ./packages/app-ai/
COPY packages/app-cerebrum/package.json ./packages/app-cerebrum/
COPY packages/app-finance/package.json ./packages/app-finance/
COPY packages/app-food/package.json ./packages/app-food/
COPY packages/app-food-db/package.json ./packages/app-food-db/
COPY packages/app-inventory/package.json ./packages/app-inventory/
COPY packages/app-lists/package.json ./packages/app-lists/
COPY packages/app-lists-db/package.json ./packages/app-lists-db/
COPY packages/app-media/package.json ./packages/app-media/
COPY packages/cerebrum-contract/package.json ./packages/cerebrum-contract/
COPY packages/cerebrum-db/package.json ./packages/cerebrum-db/
COPY packages/core-contract/package.json ./packages/core-contract/
COPY packages/core-db/package.json ./packages/core-db/
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/finance-contract/package.json ./packages/finance-contract/
COPY packages/finance-db/package.json ./packages/finance-db/
COPY packages/food-contract/package.json ./packages/food-contract/
COPY packages/food-contracts/package.json ./packages/food-contracts/
COPY packages/food-db/package.json ./packages/food-db/
COPY packages/ha-bridge-db/package.json ./packages/ha-bridge-db/
COPY packages/inventory-contract/package.json ./packages/inventory-contract/
COPY packages/inventory-db/package.json ./packages/inventory-db/
COPY packages/lists-contract/package.json ./packages/lists-contract/
COPY packages/lists-db/package.json ./packages/lists-db/
COPY packages/media-contract/package.json ./packages/media-contract/
COPY packages/media-db/package.json ./packages/media-db/
COPY packages/module-registry/package.json ./packages/module-registry/
COPY packages/navigation/package.json ./packages/navigation/
COPY packages/overlay-ego/package.json ./packages/overlay-ego/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/wire-conformance/package.json ./packages/wire-conformance/

# Install pnpm + every workspace dependency.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile

# Phase 2: sources for the transitive @pops/* deps of @pops/inventory-api
# (resolved via `pnpm m ls --filter "@pops/inventory-api..." --json`).
# A change in a non-listed package does NOT invalidate this image's
# Phase 2 layer.
# @pops/app-lists-db
COPY packages/app-lists-db/src ./packages/app-lists-db/src
COPY packages/app-lists-db/tsconfig.json ./packages/app-lists-db/tsconfig.json
# @pops/cerebrum-contract
COPY packages/cerebrum-contract/src ./packages/cerebrum-contract/src
COPY packages/cerebrum-contract/scripts ./packages/cerebrum-contract/scripts
COPY packages/cerebrum-contract/openapi ./packages/cerebrum-contract/openapi
COPY packages/cerebrum-contract/tsconfig.json ./packages/cerebrum-contract/tsconfig.json
# @pops/cerebrum-db
COPY packages/cerebrum-db/src ./packages/cerebrum-db/src
COPY packages/cerebrum-db/migrations ./packages/cerebrum-db/migrations
COPY packages/cerebrum-db/tsconfig.json ./packages/cerebrum-db/tsconfig.json
# @pops/core-contract
COPY packages/core-contract/src ./packages/core-contract/src
COPY packages/core-contract/scripts ./packages/core-contract/scripts
COPY packages/core-contract/openapi ./packages/core-contract/openapi
COPY packages/core-contract/tsconfig.json ./packages/core-contract/tsconfig.json
# @pops/core-db
COPY packages/core-db/src ./packages/core-db/src
COPY packages/core-db/migrations ./packages/core-db/migrations
COPY packages/core-db/tsconfig.json ./packages/core-db/tsconfig.json
# @pops/db-types
COPY packages/db-types/src ./packages/db-types/src
COPY packages/db-types/scripts ./packages/db-types/scripts
COPY packages/db-types/tsconfig.json ./packages/db-types/tsconfig.json
# @pops/finance-contract
COPY packages/finance-contract/src ./packages/finance-contract/src
COPY packages/finance-contract/scripts ./packages/finance-contract/scripts
COPY packages/finance-contract/openapi ./packages/finance-contract/openapi
COPY packages/finance-contract/tsconfig.json ./packages/finance-contract/tsconfig.json
# @pops/finance-db
COPY packages/finance-db/src ./packages/finance-db/src
COPY packages/finance-db/migrations ./packages/finance-db/migrations
COPY packages/finance-db/tsconfig.json ./packages/finance-db/tsconfig.json
# @pops/food-db
COPY packages/food-db/src ./packages/food-db/src
COPY packages/food-db/migrations ./packages/food-db/migrations
COPY packages/food-db/tsconfig.json ./packages/food-db/tsconfig.json
# @pops/inventory-contract
COPY packages/inventory-contract/src ./packages/inventory-contract/src
COPY packages/inventory-contract/scripts ./packages/inventory-contract/scripts
COPY packages/inventory-contract/openapi ./packages/inventory-contract/openapi
COPY packages/inventory-contract/tsconfig.json ./packages/inventory-contract/tsconfig.json
# @pops/inventory-db
COPY packages/inventory-db/src ./packages/inventory-db/src
COPY packages/inventory-db/migrations ./packages/inventory-db/migrations
COPY packages/inventory-db/tsconfig.json ./packages/inventory-db/tsconfig.json
# @pops/media-contract
COPY packages/media-contract/src ./packages/media-contract/src
COPY packages/media-contract/scripts ./packages/media-contract/scripts
COPY packages/media-contract/openapi ./packages/media-contract/openapi
COPY packages/media-contract/tsconfig.json ./packages/media-contract/tsconfig.json
# @pops/media-db
COPY packages/media-db/src ./packages/media-db/src
COPY packages/media-db/migrations ./packages/media-db/migrations
COPY packages/media-db/tsconfig.json ./packages/media-db/tsconfig.json
# @pops/pillar-sdk
COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/tsconfig.json
# @pops/types
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
COPY packages/types/tsconfig.build.json ./packages/types/tsconfig.build.json

# Pillar app sources.
COPY apps/pops-inventory-api/src ./apps/pops-inventory-api/src
COPY apps/pops-inventory-api/tsconfig.json ./apps/pops-inventory-api/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the app.
# `^...` expands to every dependency of the target excluding the target,
# letting pnpm compute build order from the lockfile (see #3285).
RUN pnpm --filter "@pops/inventory-api^..." build
RUN pnpm --filter "@pops/inventory-api" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/inventory-api deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/apps/pops-inventory-api/dist ./dist

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3001
USER node
CMD ["node", "dist/server.js"]
