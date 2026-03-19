FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all workspace packages
COPY packages/db-types/package.json ./packages/db-types/
COPY apps/finance-api/package.json ./apps/finance-api/

# Install pnpm and dependencies (workspace resolution)
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source files
COPY packages/db-types/src ./packages/db-types/src
COPY packages/db-types/tsconfig.json ./packages/db-types/
COPY apps/finance-api/tsconfig.json ./apps/finance-api/
COPY apps/finance-api/src ./apps/finance-api/src

# Build db-types first
WORKDIR /app/packages/db-types
RUN pnpm build

# Build finance-api
WORKDIR /app/apps/finance-api
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache curl

# Copy built service
COPY --from=builder /app/apps/finance-api/dist ./dist
COPY --from=builder /app/apps/finance-api/package.json ./

# Copy node_modules and workspace dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/db-types/dist ./node_modules/@pops/db-types/dist
COPY --from=builder /app/packages/db-types/package.json ./node_modules/@pops/db-types/

EXPOSE 3000
CMD ["node", "dist/index.js"]
