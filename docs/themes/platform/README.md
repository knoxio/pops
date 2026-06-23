# Theme: Platform

> The cross-cutting infrastructure every pillar leans on: CI gates and image publishing, per-pillar database lifecycle, the Redis + job-queue runtime, the OpenAPI wire contract, vector storage, application packaging, and the MCP gateway.

## Strategic Objective

Pops is **deployable by anyone with any hardware**. The contract is the public `infra/docker-compose.yml` plus per-pillar images on `ghcr.io/knoxio/pops-*`. CI publishes images on every push to `main`; deployers (whether the knoxio home lab or a stranger) pull and run. Host-level provisioning — networking, secrets storage, backups, ingress — is the deployer's responsibility; pops ships the compose contract, not the server. The knoxio home lab consumes that contract through [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra), one valid deployer among many.

Underneath packaging sits the shared runtime the pillars depend on: a Redis container and durable job queue for background work, each pillar's OpenAPI snapshot as the polyglot wire surface, sqlite-vec for semantic search, a per-pillar SQLite lifecycle that migrates and backs up each database independently, and a standalone MCP gateway that exposes the fleet to AI agents on the LAN.

## Success Criteria

- A fresh Docker host runs pops with `git clone … && docker compose -f infra/docker-compose.yml up -d` once secrets are populated.
- Every push to `main` publishes the per-pillar images (multi-tag: `main`, `sha-<short>`, `vN` on tag pushes); deployers favouring stability over freshness pin `POPS_IMAGE_TAG` to a specific sha.
- The compose file ships a Watchtower service so any deployer gets auto-rollout for free, with a documented opt-out (`POPS_IMAGE_TAG=sha-…`).
- CI quality gates (lint, typecheck, test, format, docker-build, compose config) run on every PR and on every push to `main`, collapsed into one required `CI Gate` aggregator. Image publishing runs in parallel on push to `main`.
- Each pillar applies its Drizzle migration journal on startup; production guards block destructive ops; each database is backed up independently.
- The Redis + job-queue runtime, per-pillar OpenAPI contract, and sqlite-vec vector storage are all available to the application layer.
- The MCP gateway exposes inventory, finance, media, and cerebrum data — read and write — to any MCP client on the local network.

## Epics

| Epic                                                    | Summary                                                                       | Status |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| [CI/CD Pipelines](epics/cicd-pipelines.md)              | GitHub Actions quality gates + per-pillar image publishing to GHCR            | Done   |
| [Database Operations](epics/database-operations.md)     | Per-pillar Drizzle migrations at boot, production guards, independent backups | Done   |
| [Cortex Infrastructure](epics/cortex-infrastructure.md) | Redis + BullMQ job queue, OpenAPI pillar contract, sqlite-vec vector storage  | Done   |
| [MCP Interface](epics/mcp-interface.md)                 | Standalone HTTP MCP gateway exposing the fleet to AI agents over the LAN      | Done   |

CI/CD and Database Operations are independent. Cortex Infrastructure depends on Database Operations (sqlite-vec reuses the per-pillar migration system). The MCP Interface depends on its target pillars and the registry being reachable.

## PRD Index

Every PRD lives under [`prds/`](prds/), grouped by epic.

### CI/CD + packaging

| PRD                                                                           | Summary                                                                                                               | Status |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ |
| [CI/CD Pipelines](prds/cicd-pipelines/README.md)                              | Disk-discovered per-unit quality matrices over `pillars/*` + `libs/*`, collapsed to one required `CI Gate` aggregator | Done   |
| [Application Packaging & GHCR Contract](prds/application-packaging/README.md) | `publish-images.yml`, `infra/docker-compose.yml` as the public deployment artifact, secrets layout, Watchtower hook   | Done   |

### Database lifecycle

| PRD                                                       | Summary                                                                                                        | Status |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| [Database Operations](prds/database-operations/README.md) | Per-pillar SQLite lifecycle: Drizzle migration journal at boot, path resolution, independent Litestream backup | Done   |

### Cortex runtime

| PRD                                                            | Summary                                                                                          | Status |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| [Redis Container & Connection](prds/redis-container/README.md) | Redis 7 in the Docker stack, connection module, dev setup                                        | Done   |
| [Job Queue Infrastructure](prds/job-queue/README.md)           | BullMQ queues, typed workers, job management API, failure handling                               | Done   |
| [OpenAPI Pillar Contract](prds/openapi-contract/README.md)     | Per-pillar OpenAPI 3.0.x projection of each REST contract, served at `GET /openapi`, drift-gated | Done   |
| [Vector Storage](prds/vector-storage/README.md)                | sqlite-vec extension, embedding schema, similarity search service, embedding generation pipeline | Done   |

### MCP gateway

| PRD                                     | Summary                                                                                                       | Status |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| [MCP Server](prds/mcp-server/README.md) | HTTP MCP gateway: transport, discovery/auth, tool catalogue (inventory, finance, media, cerebrum), CI publish | Done   |

## Key Decisions

| Decision           | Choice                               | Rationale                                                                          |
| ------------------ | ------------------------------------ | ---------------------------------------------------------------------------------- |
| Container runtime  | Docker Compose                       | Simple, declarative, good enough for a single-host fleet; works on any Docker host |
| Image registry     | GitHub Container Registry (GHCR)     | Free for public packages, attached to the repo, no extra account                   |
| Image rollout      | Watchtower polling 60s, label-scoped | Pull-based — works on any host without exposing CI/CD to the server                |
| Pin / rollback     | `POPS_IMAGE_TAG` env var             | One-line override; pinning to a fixed sha disables auto-update for that container  |
| CI runners         | `ubuntu-latest`                      | Pops CI never needs a lab host; a self-hosted runner is a deployer concern         |
| Job queue          | Redis + BullMQ                       | Durable, retryable, dashboard-ready, TypeScript-native                             |
| Wire contract      | Per-pillar OpenAPI snapshot          | Each pillar's contract projects to OpenAPI for polyglot consumers; drift-gated     |
| Vector storage     | sqlite-vec                           | Same DB, same backups, sufficient for single-user scale                            |
| Database lifecycle | Per-pillar SQLite, migrated at boot  | Each pillar owns its DB; no shared database to coordinate migrations across        |

## Boundary with the deployer

| Concern                                | Owner                |
| -------------------------------------- | -------------------- |
| What images get published              | this repo            |
| `infra/docker-compose.yml` contents    | this repo            |
| Env vars + `secrets/<name>` layout     | this repo (contract) |
| Server provisioning + secrets storage  | deployer             |
| Where compose lives on a host          | deployer             |
| Watchtower polling cadence + GHCR auth | deployer             |
| Ingress / tunnel rules                 | deployer             |
| Backups of pops volumes                | deployer             |

The knoxio home lab fills the deployer column via [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra); a stranger fills it however they run Docker.

## Risks

- **GHCR public/private mismatch** — If images are private and a deployer (or Watchtower) lacks GHCR auth, pulls fail silently in some flows. Mitigation: CI publishes public packages by default; deployer instructions call this out.
- **Schema migration in production** — Each pillar migrates on startup. A bad migration kills that container; its healthcheck fails; Watchtower rolls forward to the next image. Mitigation: pre-migration backup (`VACUUM INTO`) + production guards + manual rollback via `POPS_IMAGE_TAG`.
- **Redis failure** — Job queue and cache unavailable. Mitigation: pillars degrade gracefully, no source-of-truth data lives in Redis, auto-reconnect on recovery.

## Out of Scope

- Server-side concerns (secrets storage, networking, backups, monitoring, ingress) — owned by the deployer.
- Multi-server deployment or Kubernetes.
- Automated scaling, CDN, edge caching.
