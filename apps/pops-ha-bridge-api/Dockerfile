FROM node:22-slim AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

COPY packages/ha-bridge-db/package.json ./packages/ha-bridge-db/
COPY packages/finance-contract/package.json ./packages/finance-contract/
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
COPY apps/pops-ha-bridge-api/package.json ./apps/pops-ha-bridge-api/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile

COPY packages/ha-bridge-db/src ./packages/ha-bridge-db/src
COPY packages/ha-bridge-db/tsconfig.json ./packages/ha-bridge-db/
COPY packages/ha-bridge-db/migrations ./packages/ha-bridge-db/migrations
COPY packages/finance-contract/ ./packages/finance-contract/
COPY packages/pillar-sdk/ ./packages/pillar-sdk/

COPY apps/pops-ha-bridge-api/tsconfig.json ./apps/pops-ha-bridge-api/
COPY apps/pops-ha-bridge-api/src ./apps/pops-ha-bridge-api/src

WORKDIR /app/packages/ha-bridge-db
RUN pnpm build
WORKDIR /app/packages/finance-contract
RUN pnpm build
WORKDIR /app/packages/pillar-sdk
RUN pnpm build

WORKDIR /app/apps/pops-ha-bridge-api
RUN pnpm build

RUN pnpm --filter @pops/ha-bridge-api deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/apps/pops-ha-bridge-api/dist ./dist

# The opener resolves the migrations folder via import.meta.url-relative
# lookup (`<pkg>/dist/open-ha-bridge-db.js` → `<pkg>/migrations/`). Copy
# the journal next to the built dist inside @pops/ha-bridge-db so the
# runtime layout matches the dev layout.
COPY --from=builder --chown=node:node /app/packages/ha-bridge-db/migrations ./node_modules/@pops/ha-bridge-db/migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3008
USER node
CMD ["node", "dist/server.js"]
