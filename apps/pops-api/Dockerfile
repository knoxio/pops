FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy all workspace packages
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/types/package.json ./packages/types/
COPY apps/pops-api/package.json ./apps/pops-api/

# Install pnpm and dependencies (cached across builds)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile

# Copy source files
COPY packages/db-types/src ./packages/db-types/src
COPY packages/db-types/tsconfig.json ./packages/db-types/
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/
COPY apps/pops-api/tsconfig.json ./apps/pops-api/
COPY apps/pops-api/src ./apps/pops-api/src

# Build db-types first
WORKDIR /app/packages/db-types
RUN pnpm build

# Build pops-api
WORKDIR /app/apps/pops-api
RUN pnpm build

# Deploy creates a standalone directory with all runtime deps (no symlinks)
RUN pnpm --filter @pops/api deploy --prod --legacy /app/deploy

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache curl

# Copy the standalone deployment (includes node_modules with real files, not symlinks)
COPY --from=builder /app/deploy ./

# Copy built dist
COPY --from=builder /app/apps/pops-api/dist ./dist

# Copy SQL migration files (tsc doesn't copy .sql files)
COPY --from=builder /app/apps/pops-api/src/db/migrations ./dist/db/migrations
COPY --from=builder /app/apps/pops-api/src/db/drizzle-migrations ./dist/db/drizzle-migrations

# Copy db-types built output into node_modules
COPY --from=builder /app/packages/db-types/dist ./node_modules/@pops/db-types/dist
COPY --from=builder /app/packages/db-types/package.json ./node_modules/@pops/db-types/

# Copy types source into node_modules (source-only package, no build step)
COPY --from=builder /app/packages/types/src ./node_modules/@pops/types/src
COPY --from=builder /app/packages/types/package.json ./node_modules/@pops/types/

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3000
CMD ["node", "dist/index.js"]
