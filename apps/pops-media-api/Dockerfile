FROM node:22-slim AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Copy workspace package.json files (for dep resolution)
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/types/package.json ./packages/types/
COPY packages/media-db/package.json ./packages/media-db/
COPY packages/finance-contract/package.json ./packages/finance-contract/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY apps/pops-media-api/package.json ./apps/pops-media-api/

# Install pnpm and all workspace dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile

# Copy shared package sources
COPY packages/db-types/src ./packages/db-types/src
COPY packages/db-types/tsconfig.json ./packages/db-types/
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json packages/types/tsconfig.build.json ./packages/types/
COPY packages/media-db/src ./packages/media-db/src
COPY packages/media-db/tsconfig.json ./packages/media-db/
COPY packages/media-db/migrations ./packages/media-db/migrations
COPY packages/finance-contract/ ./packages/finance-contract/
COPY packages/pillar-sdk/ ./packages/pillar-sdk/

# Copy media-api source
COPY apps/pops-media-api/tsconfig.json ./apps/pops-media-api/
COPY apps/pops-media-api/src ./apps/pops-media-api/src

# Build shared packages first
WORKDIR /app/packages/db-types
RUN pnpm build
WORKDIR /app/packages/types
RUN pnpm build
WORKDIR /app/packages/media-db
RUN pnpm build
WORKDIR /app/packages/finance-contract
RUN pnpm build
WORKDIR /app/packages/pillar-sdk
RUN pnpm build

# Build media-api
WORKDIR /app/apps/pops-media-api
RUN pnpm build

# Create standalone deployment (production deps only, no symlinks)
RUN pnpm --filter @pops/media-api deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/apps/pops-media-api/dist ./dist

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3003
USER node
CMD ["node", "dist/server.js"]
