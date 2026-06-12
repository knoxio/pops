# PRD-208: Search orchestrator relocation

> Epic: [Cross-pillar code placement](../../epics/08b-cross-pillar-code-placement.md)

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

## User Stories

| #   | Story                                                         | Summary                                                                |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 01  | [us-01-container-scaffold](us-01-container-scaffold.md)       | New `apps/pops-search-api/` package + Dockerfile                       |
| 02  | [us-02-relocate-orchestrator](us-02-relocate-orchestrator.md) | Move PRD-197's orchestrator from pops-api to new container             |
| 03  | [us-03-nginx-dispatch](us-03-nginx-dispatch.md)               | Route `/trpc/search.*` to pops-search-api                              |
| 04  | [us-04-deploy](us-04-deploy.md)                               | Add to compose; deploy to capivara; verify federated search end-to-end |

## Out of Scope

- AI orchestrator (PRD-209).
- Search-specific caching (separate concern).
