# Theme: Platform

> Application-side platform: how pops is packaged, published, and rolled out to any Docker host. CI gates, database operations, and the cortex runtime that supports the rest of the app.

## Strategic Objective

Pops is **deployable by anyone with any hardware**. The contract is the public `infra/docker-compose.yml` plus images on `ghcr.io/knoxio/pops-{api,shell}`. CI publishes images on every push to `main`; deployers (whether the knoxio home lab or a stranger) pull and run. Server-side provisioning is intentionally _not_ in this theme — it lives in the private [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra) repo and is one valid consumer of pops's deployment contract among many.

## Success Criteria

- A fresh Docker host can run pops with `git clone … && docker compose -f infra/docker-compose.yml up -d` after secrets are populated
- Every push to `main` publishes `ghcr.io/knoxio/pops-api` and `ghcr.io/knoxio/pops-shell` (multi-tag: `main`, `sha-<short>`, `vN` on tag pushes)
- The compose file ships a Watchtower service so any deployer gets auto-rollout for free, with a documented opt-out (`POPS_IMAGE_TAG=sha-…`)
- CI quality gates (lint, typecheck, test, format, docker-build, compose config) pass before any image is published
- Database migrations apply automatically on `pops-api` startup; production guards block destructive ops
- Cortex runtime (Redis + job queue, OpenAPI contract, vector storage) supports the application layer

## Epics

| #   | Epic                                                       | Summary                                                                                  | Status |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| 00  | [CI/CD Pipelines](epics/00-cicd-pipelines.md)              | GitHub Actions workflows for quality gates + image publishing to GHCR                    | Done   |
| 01  | [Database Operations](epics/01-database-operations.md)     | Drizzle migrations on startup, production guards, pre-migration backups, go-live runbook | Done   |
| 02  | [Cortex Infrastructure](epics/02-cortex-infrastructure.md) | Redis + BullMQ job queue, OpenAPI secondary contract, sqlite-vec vector storage          | Done   |

## Key Decisions

| Decision          | Choice                               | Rationale                                                                         |
| ----------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| Container runtime | Docker Compose                       | Simple, declarative, good enough for <10 services; works on any Docker host       |
| Image registry    | GitHub Container Registry (GHCR)     | Free for public packages, attached to the repo, no extra account                  |
| Image rollout     | Watchtower polling 60s, label-scoped | Pull-based — works on any host without exposing CI/CD to the server               |
| Pin / rollback    | `POPS_IMAGE_TAG` env var             | One-line override; pinning to a fixed sha disables auto-update for that container |
| CI/CD runners     | `ubuntu-latest`                      | Pops CI never needs the lab host; self-hosted runner is for `homelab-infra` only  |
| Job queue         | Redis + BullMQ                       | Durable, retryable, dashboard-ready, TypeScript-native                            |
| API contract      | tRPC + OpenAPI bolt-on               | tRPC primary; OpenAPI for external consumers via trpc-openapi                     |
| Vector storage    | sqlite-vec                           | Same DB, same backups, sufficient for single-user scale                           |

## Boundary with `homelab-infra`

| Concern                                | Owner                |
| -------------------------------------- | -------------------- |
| What images get published              | this repo            |
| `infra/docker-compose.yml` contents    | this repo            |
| Env vars + `secrets/<name>` layout     | this repo (contract) |
| Server provisioning (ansible, vault)   | homelab-infra        |
| Where compose lives on a host          | homelab-infra        |
| Watchtower polling cadence + GHCR auth | homelab-infra        |
| Cloudflare Tunnel ingress rules        | homelab-infra        |
| Backups of pops volumes                | homelab-infra        |

If pops disappeared tomorrow, `homelab-infra` would still describe a coherent home-lab. If `homelab-infra` disappeared, pops would still be deployable by anyone with a Docker host. The split is intentional.

## Risks

- **GHCR public/private mismatch** — If images are private and a deployer (or Watchtower) lacks GHCR auth, pulls fail silently in some flows. Mitigation: CI publishes to public packages by default; deployer instructions call this out.
- **Schema migration in production** — Drizzle migrations apply on container startup. A bad migration kills the container; healthcheck fails; Watchtower rolls forward to the next bad image. Mitigation: pre-migration backup (`VACUUM INTO`) + production guards + manual rollback via `POPS_IMAGE_TAG`.
- **Redis failure** — Job queue and cache unavailable. Mitigation: API degrades gracefully, no source-of-truth data in Redis, auto-reconnect on recovery.

## Out of Scope

- Server-side concerns (ansible, vault, networking, backups, monitoring) → [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra)
- Multi-server deployment or Kubernetes
- Automated scaling, CDN, edge caching
