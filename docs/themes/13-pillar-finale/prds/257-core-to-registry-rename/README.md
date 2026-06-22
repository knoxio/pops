# PRD-257: core → registry rename (capstone)

> Epic: [Central registry](../../epics/02-central-registry.md)
>
> Plan: [`docs/plans/05-core-to-registry-rename.md`](../../../../plans/05-core-to-registry-rename.md)

## Overview

The platform pillar historically named `core` is renamed to `registry` — its true role is the live registry / discovery / settings host every pillar finds peers through. This is a pure identity rename (directory, package, image, container/DNS host, env, nginx, CI discovery, litestream config, docs), NOT a refactor: every route, handler, table, and wire-protocol string the pillar serves is preserved byte-identically. The rename ships with a **dual-alias window** so a not-yet-rebuilt pillar still resolves the renamed container during rollout.

## Scope

| Axis                     | From                          | To                                                     |
| ------------------------ | ----------------------------- | ------------------------------------------------------ |
| Pillar directory         | `pillars/core`                | `pillars/registry`                                     |
| npm package              | `@pops/core`                  | `@pops/registry`                                       |
| Manifest pillar id       | `core`                        | `registry` (incl. `KnownPillarId`, module id)          |
| Docker image             | `ghcr.io/knoxio/pops-core`    | `ghcr.io/knoxio/pops-registry`                         |
| Container / DNS service  | `core-api` / `pops-core`      | `registry-api` / `pops-registry` (+ `core-api` alias)  |
| SDK default registry URL | `http://core-api:3001`        | `http://registry-api:3001`                             |
| nginx upstream + prefix  | `/core-api` → `core-api:3001` | `/registry-api` → `registry-api:3001` (+ legacy block) |
| litestream config file   | `infra/litestream/core.yml`   | `infra/litestream/registry.yml`                        |

## Dual-alias window (the no-break guarantee)

The renamed compose service `registry-api` carries BOTH `core-api` and `registry-api` as network aliases on the `frontend` and `backend` networks. An old-SDK pillar dialing `http://core-api:3001/registry/register` and a new-SDK pillar dialing `http://registry-api:3001/registry/register` land on the same container, same handler, same `pillar_registry` table. nginx serves BOTH `/registry-api/` (canonical, generated) and a transitional `/core-api/` block (proxying to `registry-api:3001`) so an un-regenerated shell bundle still resolves. The `core-api` alias and the `/core-api/` block are removed in a LATER step, gated on observed zero legacy-alias traffic.

## Litestream continuity

The config file renames to `registry.yml`, but the on-disk db path stays `/data/sqlite/core.db` and the replica env stays `${CORE_LITESTREAM_REPLICA_URL}` — DELIBERATELY, so the existing `core.db` backup stream is not orphaned. Compose's `CORE_SQLITE_PATH` also stays `core.db`, so litestream and the pillar agree on the live file. The deployer (homelab-infra) renames the on-disk file to `registry.db` and re-keys the replica out of band, flipping both the config and `CORE_SQLITE_PATH` atomically once the migrated file exists.

## Route surface preserved

Every route the old `core` pillar served is served identically by `registry` (the pillar id in the manifest changed; the route strings, handlers, and tables did not): health/discovery (`/health`, `/pillars`, `/pillars/health`, `/openapi`, `/uri/resolve`), the dual-served registry handshake (`/registry/{pillars,register,heartbeat,deregister}` + legacy `/core.registry.*` aliases), SSE (`/registry/subscribe`), features (`/features/*`), service-accounts (`/service-accounts/*`), settings + aggregate (`/settings/*`, `/settings/aggregate`), `/shell/manifest`, and `/users`.

## Acceptance Criteria

- [x] `pillars/core` → `pillars/registry` via `git mv` (history preserved); `@pops/core` → `@pops/registry`; lockfile regenerated.
- [x] Manifest `pillar` id, `KnownPillarId`/`PILLARS`, `ALL_MODULE_IDS`/`MODULE_PARENT_PILLAR`, the module-registry module id, and the regenerated `generated.ts` all read `registry`.
- [x] Image ref `ghcr.io/knoxio/pops-registry` + `container_name: pops-registry` in both compose files; `publish-images.yml discover` lists `registry`, not `core`.
- [x] Compose service `registry-api` with `aliases: [core-api, registry-api]` on both networks; every `depends_on`, `POPS_PILLARS`, and `POPS_REGISTRY_URL` default flipped to `registry-api`; `CORE_SELF_BASE_URL` → `REGISTRY_SELF_BASE_URL` (legacy read as fallback).
- [x] nginx generator emits `/registry-api/` + a transitional `/core-api/` alias block; `nginx.conf` regenerated, drift check green.
- [x] SDK baked-in default URLs flip to `http://registry-api:3001`; the alias backstops any un-rebuilt pillar.
- [x] litestream `core.yml` → `registry.yml`; db path + replica key kept stable for backup continuity (deployer-owned migration documented).
- [x] `turbo typecheck test build lint`, `oxfmt --check`, module-boundary, and `cargo` (contacts) checks all green locally.
- [x] AGENTS.md + docs updated; a one-line "formerly core" note kept.

## Out of Scope

- The browser-facing `/core-api` → `/registry-api` flag-day (shell client dir rename) — a later deploy-observed step, backstopped by the transitional `/core-api/` nginx block.
- Removing the `core-api` network alias and the transitional nginx block — gated on observed zero legacy-alias traffic.
- The on-disk `core.db` → `registry.db` file rename + replica re-key — deployer-owned (homelab-infra), out of this repo.
