FROM node:22-slim AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Copy all workspace packages
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/types/package.json ./packages/types/
COPY packages/module-registry/package.json ./packages/module-registry/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/core-db/package.json ./packages/core-db/
COPY packages/core-contract/package.json ./packages/core-contract/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
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
COPY packages/core-db/src ./packages/core-db/src
COPY packages/core-db/tsconfig.json ./packages/core-db/
COPY packages/core-db/migrations ./packages/core-db/migrations
COPY packages/core-contract/ ./packages/core-contract/
COPY packages/pillar-sdk/ ./packages/pillar-sdk/
COPY apps/pops-api/tsconfig.json ./apps/pops-api/
COPY apps/pops-api/src ./apps/pops-api/src
COPY apps/pops-api/scripts ./apps/pops-api/scripts

# Build shared packages first. After PRD-245 US-08 the pillar `-db`
# packages own their schemas and `@pops/db-types` is a leaf constants
# package — order between db-types and the pillars no longer matters.
WORKDIR /app/packages/db-types
RUN pnpm build
WORKDIR /app/packages/core-db
RUN pnpm build
WORKDIR /app/packages/types
RUN pnpm build
WORKDIR /app/packages/module-registry
RUN pnpm build
WORKDIR /app/packages/core-contract
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
COPY --from=builder /app/packages/core-db/dist ./node_modules/@pops/core-db/dist
COPY --from=builder /app/packages/core-db/package.json ./node_modules/@pops/core-db/
COPY --from=builder /app/packages/core-db/migrations ./node_modules/@pops/core-db/migrations

# Copy types source into node_modules (source-only package, no build step)
COPY --from=builder /app/packages/types/src ./node_modules/@pops/types/src
COPY --from=builder /app/packages/types/package.json ./node_modules/@pops/types/

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3000
CMD ["node", "dist/index.js"]
