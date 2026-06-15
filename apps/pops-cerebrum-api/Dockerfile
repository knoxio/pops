FROM node:22-slim AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Copy workspace package.json files (for dep resolution)
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/media-db/package.json ./packages/media-db/
COPY packages/app-lists-db/package.json ./packages/app-lists-db/
COPY packages/types/package.json ./packages/types/
COPY packages/core-db/package.json ./packages/core-db/
COPY packages/cerebrum-db/package.json ./packages/cerebrum-db/
COPY packages/finance-contract/package.json ./packages/finance-contract/
COPY packages/cerebrum-contract/package.json ./packages/cerebrum-contract/
COPY packages/core-contract/package.json ./packages/core-contract/
COPY packages/inventory-contract/package.json ./packages/inventory-contract/
COPY packages/media-contract/package.json ./packages/media-contract/
COPY packages/food-contract/package.json ./packages/food-contract/
COPY packages/lists-contract/package.json ./packages/lists-contract/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY apps/pops-cerebrum-api/package.json ./apps/pops-cerebrum-api/

# Install pnpm and all workspace dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile

# Copy shared package sources
COPY packages/db-types/src ./packages/db-types/src
COPY packages/db-types/tsconfig.json ./packages/db-types/
COPY packages/media-db/src ./packages/media-db/src
COPY packages/media-db/tsconfig.json ./packages/media-db/
COPY packages/media-db/migrations ./packages/media-db/migrations
COPY packages/app-lists-db/src ./packages/app-lists-db/src
COPY packages/app-lists-db/tsconfig.json ./packages/app-lists-db/
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json packages/types/tsconfig.build.json ./packages/types/
COPY packages/core-db/src ./packages/core-db/src
COPY packages/core-db/tsconfig.json ./packages/core-db/
COPY packages/core-db/migrations ./packages/core-db/migrations
COPY packages/cerebrum-db/src ./packages/cerebrum-db/src
COPY packages/cerebrum-db/tsconfig.json ./packages/cerebrum-db/
COPY packages/cerebrum-db/migrations ./packages/cerebrum-db/migrations
COPY packages/finance-contract/ ./packages/finance-contract/
COPY packages/cerebrum-contract/ ./packages/cerebrum-contract/
COPY packages/core-contract/ ./packages/core-contract/
COPY packages/inventory-contract/ ./packages/inventory-contract/
COPY packages/media-contract/ ./packages/media-contract/
COPY packages/food-contract/ ./packages/food-contract/
COPY packages/lists-contract/ ./packages/lists-contract/
COPY packages/pillar-sdk/ ./packages/pillar-sdk/

# Copy cerebrum-api source
COPY apps/pops-cerebrum-api/tsconfig.json ./apps/pops-cerebrum-api/
COPY apps/pops-cerebrum-api/src ./apps/pops-cerebrum-api/src

# Build shared packages first.
# media-db / app-lists-db / cerebrum-db own canonical schemas; db-types
# re-exports them via a transition shim, so all MUST build BEFORE
# db-types (PRD-245 US-04 media + US-06 lists + US-01 cerebrum /
# audit H6).
WORKDIR /app/packages/media-db
RUN pnpm build
WORKDIR /app/packages/app-lists-db
RUN pnpm build
WORKDIR /app/packages/cerebrum-db
RUN pnpm build
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

# Build cerebrum-api
WORKDIR /app/apps/pops-cerebrum-api
RUN pnpm build

# Create standalone deployment (production deps only, no symlinks)
RUN pnpm --filter @pops/cerebrum-api deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/apps/pops-cerebrum-api/dist ./dist

# Bundled migrations so openCerebrumDb's import.meta.url-relative
# `migrations/` lookup finds the journal at runtime under the deployed
# node_modules layout. The opener computes the path from its own module
# URL (`<pkg>/dist/open-cerebrum-db.js` → `<pkg>/migrations/`), so the
# folder has to land next to the built dist inside @pops/cerebrum-db.
COPY --from=builder --chown=node:node /app/packages/cerebrum-db/migrations ./node_modules/@pops/cerebrum-db/migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3007
USER node
CMD ["node", "dist/server.js"]
