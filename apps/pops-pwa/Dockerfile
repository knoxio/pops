FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all workspace packages
COPY packages/db-types/package.json ./packages/db-types/
COPY apps/pops-api/package.json ./apps/pops-api/
COPY apps/pops-pwa/package.json ./apps/pops-pwa/

# Install pnpm and dependencies (workspace resolution)
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source files for all dependencies
COPY packages/db-types/src ./packages/db-types/src
COPY packages/db-types/tsconfig.json ./packages/db-types/
COPY apps/pops-api/src ./apps/pops-api/src
COPY apps/pops-api/tsconfig.json ./apps/pops-api/
COPY apps/pops-pwa/src ./apps/pops-pwa/src
COPY apps/pops-pwa/tsconfig.json ./apps/pops-pwa/
COPY apps/pops-pwa/vite.config.ts ./apps/pops-pwa/
COPY apps/pops-pwa/index.html ./apps/pops-pwa/
COPY apps/pops-pwa/nginx.conf ./apps/pops-pwa/

# Build db-types first (required by pops-api types, which pops-pwa references)
WORKDIR /app/packages/db-types
RUN pnpm build

# Build pops-pwa
WORKDIR /app/apps/pops-pwa
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/apps/pops-pwa/dist /usr/share/nginx/html
COPY --from=builder /app/apps/pops-pwa/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
