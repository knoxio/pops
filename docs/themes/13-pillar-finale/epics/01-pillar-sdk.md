# Epic 01: Pillar SDK

> Theme: [Pillar finale](../README.md)

## Scope

Ship `@pops/pillar-sdk` — the package every pillar uses to bootstrap. Provides:

- A typed manifest schema (routes, search adapters, AI tools, URI handlers, settings keys, healthcheck, contract version)
- `bootstrapPillar(manifest, server, { dbPath })` — opens DB, runs migrations, mounts routes on Express, registers with core-api, starts heartbeat
- Discovery client: `lookupPillar(id)`, `pillarRegistry()`
- Capability projections: types for "what my pillar advertises" vs. "what I can call on others"

Goal: a pillar's `server.ts` becomes ~20 lines of `bootstrapPillar(manifest, app)` instead of the current ~100-line hand-rolled scaffold each pillar maintains.

## PRDs

| #   | PRD                             | Summary                                                                                           | Status      |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------- | ----------- |
| 157 | Manifest schema + Zod validator | Define the manifest shape, validate at boot, surface errors clearly                               | Not started |
| 158 | `bootstrapPillar()` boot helper | One-call pillar bootstrap with DB open, migrations, route mount, registry registration, heartbeat | Not started |
| 159 | Discovery client                | Server-side `lookupPillar()`, `pillarRegistry()` with caching + invalidation                      | Not started |
| 160 | Capability projection types     | Type-level transforms from manifest → "what callers can invoke"                                   | Not started |

PRDs run mostly in parallel after 157 (manifest schema is the contract everything depends on).

## Dependencies

- **Requires:** Epic 00 (contract packages exist), ADR-027 (registry shape)
- **Unlocks:** Every pillar can be re-scaffolded against the SDK; Epic 03 slice migrations use the SDK from day one

## Out of Scope

- Client-side (`pillar('media').movies.get(id)`) SDK — Epic 05
- Registry endpoints themselves — Epic 02
- Boot helpers for orchestrator-style services that aren't pillars (search-api, ai-api) — those are Epic 08b territory
