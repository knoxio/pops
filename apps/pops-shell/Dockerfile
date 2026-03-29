FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy all workspace package.json files needed by pops-shell
COPY apps/pops-shell/package.json ./apps/pops-shell/
COPY apps/pops-api/package.json ./apps/pops-api/
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/app-finance/package.json ./packages/app-finance/
COPY packages/app-media/package.json ./packages/app-media/
COPY packages/app-inventory/package.json ./packages/app-inventory/
COPY packages/app-ai/package.json ./packages/app-ai/
COPY packages/api-client/package.json ./packages/api-client/

# Install pnpm and dependencies (workspace resolution)
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source files for all workspace packages
COPY packages/db-types/ ./packages/db-types/
COPY packages/ui/ ./packages/ui/
COPY packages/app-finance/ ./packages/app-finance/
COPY packages/app-media/ ./packages/app-media/
COPY packages/app-inventory/ ./packages/app-inventory/
COPY packages/app-ai/ ./packages/app-ai/
COPY packages/api-client/ ./packages/api-client/
COPY apps/pops-api/ ./apps/pops-api/
COPY apps/pops-shell/ ./apps/pops-shell/

# Build db-types first (other packages are bundled by Vite)
# Run from workspace root so tsc resolves from hoisted node_modules
WORKDIR /app
RUN pnpm --filter @pops/db-types build

# Build pops-shell (tsc typecheck + vite build)
RUN pnpm --filter @pops/shell build

# ── Production image ──────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/apps/pops-shell/dist /usr/share/nginx/html
COPY apps/pops-shell/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
