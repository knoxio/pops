FROM node:22-slim AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Copy workspace package.json files (for dep resolution)
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY apps/pops-mcp/package.json ./apps/pops-mcp/

# Install pnpm and all workspace dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/mcp..."

# Copy shared package sources
COPY packages/pillar-sdk/ ./packages/pillar-sdk/

# Copy pops-mcp source
COPY apps/pops-mcp/tsconfig.json ./apps/pops-mcp/
COPY apps/pops-mcp/src ./apps/pops-mcp/src

# Build shared packages first (pops-mcp consumes @pops/pillar-sdk).
WORKDIR /app/packages/pillar-sdk
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
