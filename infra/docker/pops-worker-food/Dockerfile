# syntax=docker/dockerfile:1.7
#
# PRD-126 — pops-worker-food container.
#
# Consumes the `food.ingest` BullMQ queue produced by PRD-125, runs the
# per-kind ingest pipelines (PRDs 127–132), and posts results back to
# pops-api via the internal-token-gated `food.ingest.workerComplete`
# mutation. v1 ships dispatch + stub handlers; the per-kind handlers
# are filled in by their owning PRDs.
#
# Build stages:
#   1. model-baker  — pulls the faster-whisper `distil-large-v3` weights
#                      into the HuggingFace cache so first-job latency
#                      doesn't pay for the model download.
#   2. node-builder — turbo-prune + pnpm build of `@pops/worker-food`
#                      and its workspace deps; emits a self-contained
#                      `/app/deploy` tree (production deps materialised
#                      as real files via `pnpm deploy --legacy`).
#   3. runtime      — node:22-bookworm-slim + ffmpeg + Python venv with
#                      yt-dlp + faster-whisper, the prebaked HuggingFace
#                      cache, and the deployed node app.
#
# Pinned tool versions live in `infra/docker/pops-worker-food/versions.json`
# and are mirrored as build args here so a single change updates both.
# Updates are PRs (not at-runtime downloads) — yt-dlp's auto-update is
# disabled and the image must be rebuilt to ship a new version.
#
# Pinned versions also keep model + handler outputs deterministic for
# the `extractor_version` metadata field (PRD-125 contract).

ARG YT_DLP_VERSION=2025.10.26
ARG FASTER_WHISPER_VERSION=1.2.0
ARG WHISPER_MODEL=distil-large-v3

# ─── stage 1 · model bake ───────────────────────────────────────────
FROM python:3.12-slim AS model-baker
ARG FASTER_WHISPER_VERSION
ARG WHISPER_MODEL
RUN pip install --no-cache-dir "faster-whisper==${FASTER_WHISPER_VERSION}"
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

# ─── stage 2 · prune ────────────────────────────────────────────────
# `turbo prune` extracts the worker's subset of the monorepo so the
# install layer caches on lockfile + package.json changes alone.
FROM node:22-bookworm-slim AS pruner
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm dlx turbo@2 prune @pops/worker-food --docker

# ─── stage 3 · install + build ──────────────────────────────────────
FROM node:22-bookworm-slim AS node-builder
WORKDIR /app
RUN corepack enable

COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ ./
# `extends: "../../tsconfig.base.json"` chains in every package, so the
# pruned tree needs the root tsconfig copied alongside.
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

RUN pnpm --filter "@pops/worker-food..." run build
RUN pnpm --filter "@pops/worker-food" deploy --prod --legacy /app/deploy

# ─── stage 4 · runtime ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ARG YT_DLP_VERSION
ARG FASTER_WHISPER_VERSION

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      python3-pip \
      python3-venv \
      ca-certificates \
      curl \
 && rm -rf /var/lib/apt/lists/*

# Pinned yt-dlp + faster-whisper in an isolated venv so the runtime
# Python stays untouched. Both pip extras are baked at build time —
# yt-dlp's runtime auto-update path is intentionally disabled (the
# worker only sees what the image ships).
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir \
      "yt-dlp==${YT_DLP_VERSION}" \
      "faster-whisper==${FASTER_WHISPER_VERSION}"
ENV PATH="/opt/venv/bin:${PATH}"

# Bring in the prebaked HuggingFace cache so first-job latency doesn't
# pay for the model download.
COPY --from=model-baker /root/.cache /root/.cache

WORKDIR /app
RUN groupadd -r worker && useradd -r -g worker -d /app -s /sbin/nologin worker

# `pnpm deploy --legacy` materialises every workspace dep as real files
# under /app/deploy; copy it as the final layer so a code-only change
# doesn't bust the Python/ffmpeg layers.
COPY --from=node-builder --chown=worker:worker /app/deploy/ ./

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION
ENV NODE_ENV=production
ENV FOOD_INGEST_DIR=/data/food/ingest

VOLUME ["/data/food/ingest"]
EXPOSE 9090
USER worker

CMD ["node", "dist/worker.js"]
