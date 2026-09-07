FROM node:24-alpine AS builder
WORKDIR /app

# The install below resolves the whole `@pops/design` subgraph, and that now
# includes better-sqlite3 — the comment API's dependency, not this image's.
# better-sqlite3 installs as `prebuild-install || node-gyp rebuild`, and on
# musl the prebuild often misses, so without a compiler here the fallback
# cannot run and the build dies on an error naming neither cause nor fix.
# Builder stage only: the runtime image is nginx and gets none of it, and the
# native module it builds is never copied out.
RUN apk add --no-cache python3 make g++

# The playground's workspace closure is `@pops/ui` and the compiled libs
# beneath it, so `libs/` must be in the context as well as `pillars/`.
# Copying both whole and letting `--filter "@pops/design..."` scope the
# install is the same trade the shell's Dockerfile makes: no hand-listed
# COPY blocks to drift, and the builder stage is discarded anyway.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./
COPY libs/ ./libs/
COPY pillars/ ./pillars/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/design..."

# Compiled libs first (pnpm no-ops the source-only ones), then the playground.
RUN pnpm --filter "@pops/design^..." build

WORKDIR /app/pillars/design
# `pnpm build` compiles the comment API into `dist/api` and `dist/db` as well;
# only the bundle in `dist/web` is copied below, so the other image's artifact
# never reaches this one.
RUN pnpm build

# ── Production image ──────────────────────────────────────────────
FROM nginx:1.31.5-alpine
COPY --from=builder /app/pillars/design/dist/web /usr/share/nginx/html
COPY pillars/design/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
