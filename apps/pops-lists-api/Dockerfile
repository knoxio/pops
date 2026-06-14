FROM node:22-slim AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Copy workspace package.json files (for dep resolution)
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/media-db/package.json ./packages/media-db/
COPY packages/types/package.json ./packages/types/
COPY packages/lists-db/package.json ./packages/lists-db/
COPY packages/finance-contract/package.json ./packages/finance-contract/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY apps/pops-lists-api/package.json ./apps/pops-lists-api/

# Install pnpm and all workspace dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile

# Copy shared package sources
COPY packages/db-types/src ./packages/db-types/src
COPY packages/db-types/tsconfig.json ./packages/db-types/
COPY packages/media-db/src ./packages/media-db/src
COPY packages/media-db/tsconfig.json ./packages/media-db/
COPY packages/media-db/migrations ./packages/media-db/migrations
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json packages/types/tsconfig.build.json ./packages/types/
COPY packages/lists-db/src ./packages/lists-db/src
COPY packages/lists-db/tsconfig.json ./packages/lists-db/
COPY packages/lists-db/migrations ./packages/lists-db/migrations
COPY packages/finance-contract/ ./packages/finance-contract/
COPY packages/pillar-sdk/ ./packages/pillar-sdk/

# Copy lists-api source
COPY apps/pops-lists-api/tsconfig.json ./apps/pops-lists-api/
COPY apps/pops-lists-api/src ./apps/pops-lists-api/src

# Build shared packages first.
# media-db owns the canonical media table schemas and is now a leaf
# package; db-types re-exports them via a transition shim, so media-db
# must build BEFORE db-types (PRD-245 US-04 / audit H6).
WORKDIR /app/packages/media-db
RUN pnpm build
WORKDIR /app/packages/db-types
RUN pnpm build
WORKDIR /app/packages/types
RUN pnpm build
WORKDIR /app/packages/lists-db
RUN pnpm build
WORKDIR /app/packages/finance-contract
RUN pnpm build
WORKDIR /app/packages/pillar-sdk
RUN pnpm build

# Build lists-api
WORKDIR /app/apps/pops-lists-api
RUN pnpm build

# Create standalone deployment (production deps only, no symlinks)
RUN pnpm --filter @pops/lists-api deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/apps/pops-lists-api/dist ./dist

# Bundled migrations so openListsDb's import.meta.url-relative
# `migrations/` lookup finds the journal at runtime under the deployed
# node_modules layout. The opener computes the path from its own module
# URL (`<pkg>/dist/open-lists-db.js` → `<pkg>/migrations/`), so the
# folder has to land next to the built dist inside @pops/lists-db.
COPY --from=builder --chown=node:node /app/packages/lists-db/migrations ./node_modules/@pops/lists-db/migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3006
USER node
CMD ["node", "dist/server.js"]
