FROM node:22-slim AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Copy workspace package.json files (for dep resolution)
COPY libs/sdk/package.json ./libs/sdk/
COPY pillars/mcp/package.json ./pillars/mcp/

# Install pnpm and all workspace dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/mcp..."

# Copy shared package sources
COPY libs/sdk/ ./libs/sdk/

# Copy pops-mcp source
COPY pillars/mcp/tsconfig.json ./pillars/mcp/
COPY pillars/mcp/src ./pillars/mcp/src

# Build shared packages first (pops-mcp consumes @pops/pillar-sdk).
WORKDIR /app/libs/sdk
RUN pnpm build

# Build pops-mcp
WORKDIR /app/pillars/mcp
RUN pnpm build

# Create standalone deployment (production deps only, no symlinks)
RUN pnpm --filter @pops/mcp deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/mcp/dist ./dist

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3002
USER node
CMD ["node", "dist/index.js"]
