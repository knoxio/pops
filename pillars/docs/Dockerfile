FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY pillars/docs/package.json ./pillars/docs/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter @pops/docs...

COPY pillars/ ./pillars/

WORKDIR /app/pillars/docs
RUN pnpm build

# ── Production image ──────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/pillars/docs/dist /usr/share/nginx/html
COPY pillars/docs/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
