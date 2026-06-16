FROM node:22-slim AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Copy all workspace packages
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/types/package.json ./packages/types/
COPY packages/module-registry/package.json ./packages/module-registry/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/app-food-db/package.json ./packages/app-food-db/
COPY packages/core-db/package.json ./packages/core-db/
COPY packages/finance-db/package.json ./packages/finance-db/
COPY packages/finance-contract/package.json ./packages/finance-contract/
COPY packages/cerebrum-contract/package.json ./packages/cerebrum-contract/
COPY packages/core-contract/package.json ./packages/core-contract/
COPY packages/media-contract/package.json ./packages/media-contract/
COPY packages/food-contract/package.json ./packages/food-contract/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY packages/media-db/package.json ./packages/media-db/
COPY packages/food-contracts/package.json ./packages/food-contracts/
COPY packages/cerebrum-db/package.json ./packages/cerebrum-db/
COPY packages/food-db/package.json ./packages/food-db/
COPY apps/pops-api/package.json ./apps/pops-api/

# Install pnpm and dependencies (cached across builds)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile

# Copy source files
COPY packages/db-types/src ./packages/db-types/src
COPY packages/db-types/tsconfig.json ./packages/db-types/
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json packages/types/tsconfig.build.json ./packages/types/
COPY packages/module-registry/src ./packages/module-registry/src
COPY packages/module-registry/tsconfig.json packages/module-registry/tsconfig.build.json ./packages/module-registry/
COPY packages/app-food-db/src ./packages/app-food-db/src
COPY packages/app-food-db/tsconfig.json ./packages/app-food-db/
COPY packages/core-db/src ./packages/core-db/src
COPY packages/core-db/tsconfig.json ./packages/core-db/
COPY packages/core-db/migrations ./packages/core-db/migrations
COPY packages/finance-db/src ./packages/finance-db/src
COPY packages/finance-db/tsconfig.json ./packages/finance-db/
COPY packages/finance-db/migrations ./packages/finance-db/migrations
COPY packages/media-db/src ./packages/media-db/src
COPY packages/media-db/tsconfig.json ./packages/media-db/
COPY packages/media-db/migrations ./packages/media-db/migrations
COPY packages/food-contracts/src ./packages/food-contracts/src
COPY packages/food-contracts/tsconfig.json ./packages/food-contracts/
COPY packages/cerebrum-db/src ./packages/cerebrum-db/src
COPY packages/cerebrum-db/tsconfig.json ./packages/cerebrum-db/
COPY packages/cerebrum-db/migrations ./packages/cerebrum-db/migrations
COPY packages/food-db/src ./packages/food-db/src
COPY packages/food-db/tsconfig.json ./packages/food-db/
COPY packages/food-db/migrations ./packages/food-db/migrations
COPY packages/finance-contract/ ./packages/finance-contract/
COPY packages/cerebrum-contract/ ./packages/cerebrum-contract/
COPY packages/core-contract/ ./packages/core-contract/
COPY packages/media-contract/ ./packages/media-contract/
COPY packages/food-contract/ ./packages/food-contract/
COPY packages/pillar-sdk/ ./packages/pillar-sdk/
COPY apps/pops-api/tsconfig.json ./apps/pops-api/
COPY apps/pops-api/src ./apps/pops-api/src
COPY apps/pops-api/scripts ./apps/pops-api/scripts

# Build shared packages first. After PRD-245 US-08 the pillar `-db`
# packages own their schemas and `@pops/db-types` is a leaf constants
# package — order between db-types and the pillars no longer matters.
WORKDIR /app/packages/db-types
RUN pnpm build
WORKDIR /app/packages/media-db
RUN pnpm build
WORKDIR /app/packages/cerebrum-db
RUN pnpm build
WORKDIR /app/packages/food-db
RUN pnpm build
WORKDIR /app/packages/core-db
RUN pnpm build
WORKDIR /app/packages/finance-db
RUN pnpm build
WORKDIR /app/packages/types
RUN pnpm build
WORKDIR /app/packages/module-registry
RUN pnpm build
WORKDIR /app/packages/food-contracts
RUN pnpm build
WORKDIR /app/packages/app-food-db
RUN pnpm build
WORKDIR /app/packages/finance-contract
RUN pnpm build
WORKDIR /app/packages/cerebrum-contract
RUN pnpm build
WORKDIR /app/packages/core-contract
RUN pnpm build
WORKDIR /app/packages/media-contract
RUN pnpm build
WORKDIR /app/packages/food-contract
RUN pnpm build
WORKDIR /app/packages/pillar-sdk
RUN pnpm build

# Build pops-api
WORKDIR /app/apps/pops-api
RUN pnpm build

# Deploy creates a standalone directory with all runtime deps (no symlinks)
RUN pnpm --filter @pops/api deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy the standalone deployment (includes node_modules with real files, not symlinks)
COPY --from=builder /app/deploy ./

# Copy built dist
COPY --from=builder /app/apps/pops-api/dist ./dist

# Copy SQL migration files (tsc doesn't copy .sql files)
COPY --from=builder /app/apps/pops-api/src/db/migrations ./dist/db/migrations
COPY --from=builder /app/apps/pops-api/src/db/drizzle-migrations ./dist/db/drizzle-migrations

# Copy shared package built output into node_modules
COPY --from=builder /app/packages/db-types/dist ./node_modules/@pops/db-types/dist
COPY --from=builder /app/packages/db-types/package.json ./node_modules/@pops/db-types/
COPY --from=builder /app/packages/types/dist ./node_modules/@pops/types/dist
COPY --from=builder /app/packages/types/package.json ./node_modules/@pops/types/
COPY --from=builder /app/packages/module-registry/dist ./node_modules/@pops/module-registry/dist
COPY --from=builder /app/packages/module-registry/package.json ./node_modules/@pops/module-registry/
COPY --from=builder /app/packages/app-food-db/dist ./node_modules/@pops/app-food-db/dist
COPY --from=builder /app/packages/app-food-db/package.json ./node_modules/@pops/app-food-db/
COPY --from=builder /app/packages/core-db/dist ./node_modules/@pops/core-db/dist
COPY --from=builder /app/packages/core-db/package.json ./node_modules/@pops/core-db/
COPY --from=builder /app/packages/core-db/migrations ./node_modules/@pops/core-db/migrations
COPY --from=builder /app/packages/finance-db/dist ./node_modules/@pops/finance-db/dist
COPY --from=builder /app/packages/finance-db/package.json ./node_modules/@pops/finance-db/
COPY --from=builder /app/packages/finance-db/migrations ./node_modules/@pops/finance-db/migrations
COPY --from=builder /app/packages/media-db/dist ./node_modules/@pops/media-db/dist
COPY --from=builder /app/packages/media-db/package.json ./node_modules/@pops/media-db/
COPY --from=builder /app/packages/media-db/migrations ./node_modules/@pops/media-db/migrations
COPY --from=builder /app/packages/cerebrum-db/dist ./node_modules/@pops/cerebrum-db/dist
COPY --from=builder /app/packages/cerebrum-db/package.json ./node_modules/@pops/cerebrum-db/
COPY --from=builder /app/packages/cerebrum-db/migrations ./node_modules/@pops/cerebrum-db/migrations
COPY --from=builder /app/packages/food-db/dist ./node_modules/@pops/food-db/dist
COPY --from=builder /app/packages/food-db/package.json ./node_modules/@pops/food-db/
COPY --from=builder /app/packages/food-db/migrations ./node_modules/@pops/food-db/migrations

# Copy types source into node_modules (source-only package, no build step)
COPY --from=builder /app/packages/types/src ./node_modules/@pops/types/src
COPY --from=builder /app/packages/types/package.json ./node_modules/@pops/types/

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3000
CMD ["node", "dist/index.js"]
