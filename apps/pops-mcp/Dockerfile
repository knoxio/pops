FROM node:22-slim AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy workspace package.json files (for dep resolution)
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/types/package.json ./packages/types/
COPY packages/module-registry/package.json ./packages/module-registry/
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

# Copy pops-api source (needed only for AppRouter type resolution at compile time)
COPY apps/pops-api/tsconfig.json ./apps/pops-api/
COPY apps/pops-api/src ./apps/pops-api/src

# Copy pops-mcp source
COPY apps/pops-mcp/tsconfig.json ./apps/pops-mcp/
COPY apps/pops-mcp/src ./apps/pops-mcp/src

# Build shared packages first (module-registry needs db-types + types)
WORKDIR /app/packages/db-types
RUN pnpm build
WORKDIR /app/packages/types
RUN pnpm build
WORKDIR /app/packages/module-registry
RUN pnpm build

# Build pops-mcp
WORKDIR /app/apps/pops-mcp
RUN pnpm build

# Create standalone deployment (production deps only, no symlinks)
RUN pnpm --filter @pops/mcp deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/deploy ./
COPY --from=builder /app/apps/pops-mcp/dist ./dist

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3002
CMD ["node", "dist/index.js"]
