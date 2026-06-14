FROM node:22-slim AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Copy workspace package.json files (for dep resolution).
# wire-conformance is included even though @pops/core-api does not depend on
# it: pnpm's --legacy deploy resolves the full workspace graph from
# pnpm-workspace.yaml and fails ERR_PNPM_WORKSPACE_PKG_NOT_FOUND when a
# listed member is absent from the build context.
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/types/package.json ./packages/types/
COPY packages/core-db/package.json ./packages/core-db/
COPY packages/finance-contract/package.json ./packages/finance-contract/
COPY packages/cerebrum-contract/package.json ./packages/cerebrum-contract/
COPY packages/core-contract/package.json ./packages/core-contract/
COPY packages/inventory-contract/package.json ./packages/inventory-contract/
COPY packages/media-contract/package.json ./packages/media-contract/
COPY packages/food-contract/package.json ./packages/food-contract/
COPY packages/lists-contract/package.json ./packages/lists-contract/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/wire-conformance/package.json ./packages/wire-conformance/
COPY apps/pops-core-api/package.json ./apps/pops-core-api/

# Install pnpm and all workspace dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile

# Copy shared package sources
COPY packages/db-types/src ./packages/db-types/src
COPY packages/db-types/tsconfig.json ./packages/db-types/
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json packages/types/tsconfig.build.json ./packages/types/
COPY packages/core-db/src ./packages/core-db/src
COPY packages/core-db/tsconfig.json ./packages/core-db/
COPY packages/core-db/migrations ./packages/core-db/migrations
COPY packages/finance-contract/ ./packages/finance-contract/
COPY packages/cerebrum-contract/ ./packages/cerebrum-contract/
COPY packages/core-contract/ ./packages/core-contract/
COPY packages/inventory-contract/ ./packages/inventory-contract/
COPY packages/media-contract/ ./packages/media-contract/
COPY packages/food-contract/ ./packages/food-contract/
COPY packages/lists-contract/ ./packages/lists-contract/
COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/

# Copy core-api source
COPY apps/pops-core-api/tsconfig.json ./apps/pops-core-api/
COPY apps/pops-core-api/src ./apps/pops-core-api/src

# Build shared packages first
WORKDIR /app/packages/db-types
RUN pnpm build
WORKDIR /app/packages/types
RUN pnpm build
WORKDIR /app/packages/core-db
RUN pnpm build
WORKDIR /app/packages/finance-contract
RUN pnpm build
WORKDIR /app/packages/cerebrum-contract
RUN pnpm build
WORKDIR /app/packages/core-contract
RUN pnpm build
WORKDIR /app/packages/inventory-contract
RUN pnpm build
WORKDIR /app/packages/media-contract
RUN pnpm build
WORKDIR /app/packages/food-contract
RUN pnpm build
WORKDIR /app/packages/lists-contract
RUN pnpm build
WORKDIR /app/packages/pillar-sdk
RUN pnpm build

# Build core-api
WORKDIR /app/apps/pops-core-api
RUN pnpm build

# Create standalone deployment (production deps only, no symlinks)
RUN pnpm --filter @pops/core-api deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/apps/pops-core-api/dist ./dist

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3001
USER node
CMD ["node", "dist/server.js"]
