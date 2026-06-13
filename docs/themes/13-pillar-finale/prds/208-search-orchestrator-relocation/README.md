# PRD-208: Search orchestrator relocation

> Epic: [Cross-pillar code placement](../../epics/08b-cross-pillar-code-placement.md)
>
> Status: **Not started**

## Overview

Move the federated search orchestrator (PRD-197) into a new `pops-search-api` container. Stand up the container; migrate the orchestrator from pops-api; route `/trpc/search.*` to it via nginx.

## Data Model

No persistent data — search-api is stateless.

## API Surface

New container `pops-search-api` listens on port 3008 (or next available). Exposes:

- `GET /health`
- tRPC `search.*` namespace: `search.query`, `search.adapters.list`, etc.

## Business Rules

- **Stateless container.** No DB connection of its own; uses the SDK to call into pillars.
- **Depends on `core-api` for registry.** Boots after core-api.
- **Container image bundles `@pops/pillar-sdk` + every contract.** Contract bundle is the only build-time pillar coupling.

## Edge Cases

| Case                                    | Behaviour                                                 |
| --------------------------------------- | --------------------------------------------------------- |
| pillar-sdk version skew with a contract | Caught by contract semver (ADR-031) compatibility checks. |
| Search container down                   | nginx 502 + PillarGuard fallback.                         |

## Acceptance Criteria

- [ ] `apps/pops-search-api/` package exists with its own `package.json`, `tsconfig`, entrypoint and Dockerfile, and is wired into the workspace + image-publish pipeline.
- [ ] The federated search router (currently `apps/pops-api/src/modules/core/search/`: `router.ts`, `engine.ts`, `query-parser.ts`, `domain-app-mapping.ts`) is hosted by `pops-search-api`, calling `runFederatedSearch` from `@pops/pillar-sdk/orchestrator` against the discovery registry — no direct pillar imports.
- [ ] The legacy `core.search.*` mount is removed from `pops-api` once the new container is wired, with a single source of truth for the `search.*` namespace.
- [ ] nginx routes `/trpc/search.*` (and `/trpc-search` if adopted) to `pops-search-api`; `GET /health` on the new container reports orchestrator readiness.
- [ ] `pops-search-api` is added to the production compose file, boots after `pops-core-api`, and end-to-end federated search returns merged results from every pillar adapter on capivara.
- [ ] All four user stories below are Done.

## User Stories

| #   | Story                                                         | Summary                                                                | Status      |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 01  | [us-01-container-scaffold](us-01-container-scaffold.md)       | New `apps/pops-search-api/` package + Dockerfile                       | Not started |
| 02  | [us-02-relocate-orchestrator](us-02-relocate-orchestrator.md) | Move PRD-197's orchestrator from pops-api to new container             | Not started |
| 03  | [us-03-nginx-dispatch](us-03-nginx-dispatch.md)               | Route `/trpc/search.*` to pops-search-api                              | Not started |
| 04  | [us-04-deploy](us-04-deploy.md)                               | Add to compose; deploy to capivara; verify federated search end-to-end | Not started |

## Implementation Snapshot

Audited against `origin/main` on 2026-06-13. None of the relocation work has begun; everything below documents the starting state.

| Concern                              | Current location                                                                                      | Target location                                                                                                             | Notes                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Federated runner (PRD-197)           | `packages/pillar-sdk/src/orchestrator/{index,runner,types}.ts`                                        | Unchanged — stays in SDK; new container consumes it                                                                         | Already the cross-pillar fan-out primitive. PRD-208 does not move this.                                                     |
| Search router + engine               | `apps/pops-api/src/modules/core/search/{router,engine,query-parser,domain-app-mapping,types}.ts`      | `apps/pops-search-api/src/...`                                                                                              | Currently wired into the `core` namespace on `pops-api`; must be cut over to its own container before legacy mount removal. |
| Per-pillar search adapters (PRD-196) | `apps/pops-api/src/modules/{finance,inventory,media,...}/.../search-adapter.ts`                       | One per pillar API container, surfaced through the discovery registry                                                       | Still on `pops-api`; move tracked by per-pillar cutover PRDs, not this one.                                                 |
| nginx dispatch for `search.*`        | `apps/pops-shell/nginx.conf` + `nginx/conf.d/_pillar-proxy.conf` exist but contain no `search` route. | New route in the shell's nginx config sending `/trpc/search.*` (and any `/trpc-search` prefix adopted) to `pops-search-api` | Slots into the per-pillar URL prefix pattern landing in PRD-190 (nginx dispatcher simplification).                          |
| Compose / deploy                     | `infra/docker-compose.yml` ships every pillar API today (no `search-api` service).                    | New `pops-search-api` service added to `infra/docker-compose.yml`, deployed to capivara                                     | Depends on the publish-images Dockerfile fix tracked in the health-and-deployment audit.                                    |

## Out of Scope

- AI orchestrator (PRD-209).
- Search-specific caching (separate concern).
