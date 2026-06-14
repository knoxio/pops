FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Copy all workspace package.json files needed by pops-shell
COPY apps/pops-shell/package.json ./apps/pops-shell/
COPY apps/pops-api/package.json ./apps/pops-api/
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/app-finance/package.json ./packages/app-finance/
COPY packages/app-food/package.json ./packages/app-food/
COPY packages/app-food-db/package.json ./packages/app-food-db/
COPY packages/food-contracts/package.json ./packages/food-contracts/
COPY packages/app-lists/package.json ./packages/app-lists/
COPY packages/app-lists-db/package.json ./packages/app-lists-db/
COPY packages/core-db/package.json ./packages/core-db/
COPY packages/finance-db/package.json ./packages/finance-db/
COPY packages/inventory-db/package.json ./packages/inventory-db/
COPY packages/media-db/package.json ./packages/media-db/
COPY packages/cerebrum-db/package.json ./packages/cerebrum-db/
COPY packages/food-db/package.json ./packages/food-db/
COPY packages/lists-db/package.json ./packages/lists-db/
COPY packages/app-media/package.json ./packages/app-media/
COPY packages/app-inventory/package.json ./packages/app-inventory/
COPY packages/app-ai/package.json ./packages/app-ai/
COPY packages/app-cerebrum/package.json ./packages/app-cerebrum/
COPY packages/overlay-ego/package.json ./packages/overlay-ego/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/navigation/package.json ./packages/navigation/
COPY packages/types/package.json ./packages/types/
COPY packages/module-registry/package.json ./packages/module-registry/
COPY packages/finance-contract/package.json ./packages/finance-contract/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/

# Install pnpm and dependencies (cached across builds)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile

# Build shared packages first (same pattern as pops-api Dockerfile)
COPY packages/db-types/src ./packages/db-types/src
COPY packages/db-types/tsconfig.json ./packages/db-types/
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json packages/types/tsconfig.build.json ./packages/types/
COPY packages/module-registry/src ./packages/module-registry/src
COPY packages/module-registry/tsconfig.json packages/module-registry/tsconfig.build.json ./packages/module-registry/
COPY packages/app-lists/ ./packages/app-lists/
COPY packages/app-lists-db/ ./packages/app-lists-db/
COPY packages/app-food-db/ ./packages/app-food-db/
COPY packages/core-db/ ./packages/core-db/
COPY packages/finance-db/ ./packages/finance-db/
COPY packages/inventory-db/ ./packages/inventory-db/
COPY packages/media-db/ ./packages/media-db/
COPY packages/cerebrum-db/ ./packages/cerebrum-db/
COPY packages/food-db/ ./packages/food-db/
COPY packages/lists-db/ ./packages/lists-db/
COPY packages/food-contracts/ ./packages/food-contracts/
COPY packages/finance-contract/ ./packages/finance-contract/
COPY packages/pillar-sdk/ ./packages/pillar-sdk/
# media-db owns the canonical media table schemas and is now a leaf
# package; db-types re-exports them via a transition shim, so media-db
# must build BEFORE db-types (PRD-245 US-04 / audit H6).
WORKDIR /app/packages/media-db
RUN pnpm build
WORKDIR /app/packages/db-types
RUN pnpm build
WORKDIR /app/packages/types
RUN pnpm build
WORKDIR /app/packages/module-registry
RUN pnpm build
WORKDIR /app/packages/food-contracts
RUN pnpm build
WORKDIR /app/packages/core-db
RUN pnpm build
WORKDIR /app/packages/finance-db
RUN pnpm build
WORKDIR /app/packages/inventory-db
RUN pnpm build
WORKDIR /app/packages/cerebrum-db
RUN pnpm build
WORKDIR /app/packages/food-db
RUN pnpm build
WORKDIR /app/packages/lists-db
RUN pnpm build
WORKDIR /app/packages/app-lists-db
RUN pnpm build
WORKDIR /app/packages/app-food-db
RUN pnpm build
WORKDIR /app/packages/finance-contract
RUN pnpm build
WORKDIR /app/packages/pillar-sdk
RUN pnpm build

# Copy remaining source files
WORKDIR /app
COPY packages/ui/ ./packages/ui/
COPY packages/app-finance/ ./packages/app-finance/
COPY packages/app-food/ ./packages/app-food/
COPY packages/app-lists/ ./packages/app-lists/
COPY packages/app-lists-db/ ./packages/app-lists-db/
COPY packages/app-media/ ./packages/app-media/
COPY packages/app-inventory/ ./packages/app-inventory/
COPY packages/app-ai/ ./packages/app-ai/
COPY packages/app-cerebrum/ ./packages/app-cerebrum/
COPY packages/overlay-ego/ ./packages/overlay-ego/
COPY packages/api-client/ ./packages/api-client/
COPY packages/navigation/ ./packages/navigation/
COPY packages/types/ ./packages/types/
COPY packages/module-registry/ ./packages/module-registry/
COPY apps/pops-api/ ./apps/pops-api/
COPY apps/pops-shell/ ./apps/pops-shell/

# Build pops-shell (tsc typecheck + vite build)
WORKDIR /app/apps/pops-shell
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION
RUN pnpm build

# ── Production image ──────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/apps/pops-shell/dist /usr/share/nginx/html
COPY apps/pops-shell/nginx.conf /etc/nginx/conf.d/default.conf
# Shared proxy partial (Theme 13 PRD-190). Installed to /etc/nginx/snippets/
# rather than /etc/nginx/conf.d/ because nginx auto-loads every `*.conf`
# under `conf.d/` as a top-level server block — a partial dropped there
# would crash boot. The source path stays under `nginx/conf.d/` per the
# PRD's repo-layout rule.
COPY apps/pops-shell/nginx/conf.d/_pillar-proxy.conf /etc/nginx/snippets/_pillar-proxy.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
