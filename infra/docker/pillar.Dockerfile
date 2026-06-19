# syntax=docker/dockerfile:1.7
#
# Generic per-pillar container template.
#
# Companion to ADR-026 (pillar architecture). One Dockerfile builds every
# pillar's api/worker container by parameterising the workspace package
# name. Pillars are not added to docker-compose individually — each
# adds a service entry pointing at this Dockerfile + the right build args.
#
# Build args (required unless noted):
#   PILLAR_PACKAGE    Full workspace package name to build, e.g.
#                     @pops/food-api, @pops/finance-api, @pops/core-api.
#   PILLAR_PORT       Port the pillar listens on (default 3000). Used only
#                     for the EXPOSE directive — the process itself reads
#                     its port from env, set by compose/runtime.
#   PILLAR_ENTRYPOINT Path inside dist/ to invoke (default index.js).
#                     Override to worker.js to produce a worker variant
#                     from the same image.
#   BUILD_VERSION     Optional version tag baked into the image as
#                     $BUILD_VERSION (default "dev"). CI sets this to the
#                     git sha.
#
# Usage from monorepo root:
#   docker build \
#     -f infra/docker/pillar.Dockerfile \
#     --build-arg PILLAR_PACKAGE=@pops/food \
#     --build-arg PILLAR_PORT=3010 \
#     -t ghcr.io/knoxio/pops-food:dev .
#
# The build uses `turbo prune --docker` to isolate the pillar's dep
# subgraph, then `pnpm deploy` to flatten it into a standalone runtime.
# No pillar-specific COPY lines means adding a new pillar is just a new
# compose service entry, not a Dockerfile edit.

# ─── stage 1 · prune ───────────────────────────────────────────────
# Walks the workspace dep graph and emits a minimal subtree containing
# only the pillar's package + transitive workspace deps. `out/json` has
# the package.jsons (used to cache `pnpm install`), `out/full` has the
# real sources, and `out/pnpm-lock.yaml` is the pruned lockfile.
FROM node:22-slim AS pruner
WORKDIR /app
RUN corepack enable
ARG PILLAR_PACKAGE
RUN test -n "$PILLAR_PACKAGE" \
  || (echo "ERROR: PILLAR_PACKAGE build arg is required (e.g. @pops/food-api)" >&2 && exit 1)
COPY . .
RUN pnpm dlx turbo@2 prune "$PILLAR_PACKAGE" --docker

# ─── stage 2 · install + build ─────────────────────────────────────
# Two-phase copy so the `pnpm install` layer is cached on lockfile +
# package.json changes alone. Source edits invalidate only the second
# copy and the build step.
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable
ARG PILLAR_PACKAGE

COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ ./
# turbo prune doesn't include root-level config files referenced by
# package tsconfigs via `extends: "../../tsconfig.base.json"`. Without
# this, every workspace tsc build fails with TS5083 and skipLibCheck
# stops being applied, masking the real cause behind a wall of
# lib-type errors.
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

# Build the pillar and every workspace dep it imports, in topo order.
# `<pkg>...` syntax means "the package and its dependencies".
RUN pnpm --filter "${PILLAR_PACKAGE}..." run build

# `pnpm deploy --prod --legacy` produces a self-contained directory
# at /app/deploy with all production deps materialised as real files
# (no workspace symlinks). This is what ships in the runtime stage.
RUN pnpm --filter "$PILLAR_PACKAGE" deploy --prod --legacy /app/deploy

# ─── stage 3 · runtime ─────────────────────────────────────────────
# Minimal image: only the deployed package + node + curl (for arbitrary
# pillar healthchecks that prefer it over node's fetch).
FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r pillar \
 && useradd -r -g pillar -d /app -s /sbin/nologin pillar

COPY --from=builder --chown=pillar:pillar /app/deploy/ ./

ARG BUILD_VERSION=dev
ARG PILLAR_PORT=3000
ARG PILLAR_ENTRYPOINT=index.js
ENV BUILD_VERSION=$BUILD_VERSION
ENV PILLAR_ENTRYPOINT=$PILLAR_ENTRYPOINT
ENV NODE_ENV=production

EXPOSE ${PILLAR_PORT}
USER pillar

# Shell form so $PILLAR_ENTRYPOINT expands at container start. Compose
# can override `command:` to point at worker.js without rebuilding.
CMD ["sh", "-c", "exec node dist/$PILLAR_ENTRYPOINT"]
