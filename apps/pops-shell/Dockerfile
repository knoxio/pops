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

# Install pnpm and dependencies (cached across builds)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile

# Copy db-types source and build it first (same pattern as pops-api Dockerfile)
COPY packages/db-types/src ./packages/db-types/src
COPY packages/db-types/tsconfig.json ./packages/db-types/
WORKDIR /app/packages/db-types
RUN pnpm build

# Copy remaining source files
WORKDIR /app
COPY packages/ui/ ./packages/ui/
COPY packages/app-finance/ ./packages/app-finance/
COPY packages/app-media/ ./packages/app-media/
COPY packages/app-inventory/ ./packages/app-inventory/
COPY packages/app-ai/ ./packages/app-ai/
COPY packages/api-client/ ./packages/api-client/
COPY apps/pops-api/ ./apps/pops-api/
COPY apps/pops-shell/ ./apps/pops-shell/

# Build pops-shell (tsc typecheck + vite build)
WORKDIR /app/apps/pops-shell
RUN pnpm build

# ── Production image ──────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/apps/pops-shell/dist /usr/share/nginx/html
COPY apps/pops-shell/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
