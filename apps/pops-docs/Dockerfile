FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/pops-docs/package.json ./apps/pops-docs/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter @pops/docs...

COPY apps/pops-docs/ ./apps/pops-docs/
COPY pillars/ ./pillars/

WORKDIR /app/apps/pops-docs
RUN pnpm build

# ── Production image ──────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/apps/pops-docs/dist /usr/share/nginx/html
COPY apps/pops-docs/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
