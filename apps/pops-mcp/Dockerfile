FROM node:22-slim AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy workspace package.json files (for dep resolution)
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/types/package.json ./packages/types/
COPY packages/module-registry/package.json ./packages/module-registry/
COPY packages/app-food-db/package.json ./packages/app-food-db/
COPY packages/app-lists/package.json ./packages/app-lists/
COPY packages/app-lists-db/package.json ./packages/app-lists-db/
COPY packages/food-contracts/package.json ./packages/food-contracts/
COPY apps/pops-api/package.json ./apps/pops-api/
COPY apps/pops-mcp/package.json ./apps/pops-mcp/

# Install pnpm and all workspace dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile

# Copy shared package sources
COPY packages/db-types/src ./packages/db-types/src
COPY packages/db-types/tsconfig.json ./packages/db-types/
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json packages/types/tsconfig.build.json ./packages/types/
COPY packages/module-registry/src ./packages/module-registry/src
COPY packages/module-registry/tsconfig.json packages/module-registry/tsconfig.build.json ./packages/module-registry/
COPY packages/app-lists/src ./packages/app-lists/src
COPY packages/app-lists-db/src ./packages/app-lists-db/src
COPY packages/app-lists-db/tsconfig.json ./packages/app-lists-db/
COPY packages/app-food-db/src ./packages/app-food-db/src
COPY packages/app-food-db/tsconfig.json ./packages/app-food-db/
COPY packages/food-contracts/src ./packages/food-contracts/src
COPY packages/food-contracts/tsconfig.json ./packages/food-contracts/

# Copy pops-api source (needed only for AppRouter type resolution at compile time)
COPY apps/pops-api/tsconfig.json ./apps/pops-api/
COPY apps/pops-api/src ./apps/pops-api/src

# Copy pops-mcp source
COPY apps/pops-mcp/tsconfig.json ./apps/pops-mcp/
COPY apps/pops-mcp/src ./apps/pops-mcp/src

# Build shared packages first (module-registry needs db-types + types;
# app-food-db is consumed by pops-api routers).
WORKDIR /app/packages/db-types
RUN pnpm build
WORKDIR /app/packages/types
RUN pnpm build
WORKDIR /app/packages/module-registry
RUN pnpm build
WORKDIR /app/packages/food-contracts
RUN pnpm build
WORKDIR /app/packages/app-lists-db
RUN pnpm build
WORKDIR /app/packages/app-food-db
RUN pnpm build

# Build pops-mcp
WORKDIR /app/apps/pops-mcp
RUN pnpm build

# Create standalone deployment (production deps only, no symlinks)
RUN pnpm --filter @pops/mcp deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/apps/pops-mcp/dist ./dist

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3002
USER node
CMD ["node", "dist/index.js"]
