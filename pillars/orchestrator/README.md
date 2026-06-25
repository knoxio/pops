# @pops/orchestrator

The **orchestrator** pillar — a stateless, cross-pillar aggregator. It owns
**no database** and serves every response by reading the live registry snapshot
and fanning out to other pillars over `@pops/pillar-sdk` (REST transport). It
listens on port **3009**.

Two capabilities are inherently cross-pillar and have no single owning domain,
so they live here:

| Surface         | What it does                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /search`  | Federated search: fans one query out to every registered, healthy, search-capable pillar's `/search` in parallel, then merges + ranks the results. A down pillar is dropped, never failing the whole search. |
| `GET /ai/tools` | AI-tool registry: projects each registered, healthy pillar's `ai.tools` manifest slot into a single flat tool list.                                                                                          |
| `GET /pillars`  | Registry-first view of the fleet (live snapshot leads, `POPS_PILLARS` seed backfills), prepended with the synthetic `orchestrator` self-entry.                                                               |
| `GET /health`   | Liveness shape (`{ ok, status, service, version, ts }`). No DB round-trip — there is no DB.                                                                                                                  |

Membership is resolved **per request** from the `registry` pillar via the SDK
discovery client (TTL-cached) — there is no static, compiled pillar list. A
pillar appears in a surface purely by advertising the matching capability
(`search.adapters`, `ai.tools`) in its manifest, so adding one needs no
orchestrator change. The reusable machinery (federated-query runner, ranking,
partial-failure semantics, tool-list projection) lives in `@pops/pillar-sdk`;
this pillar hosts those primitives on an HTTP surface rather than reimplementing
them.

Like every pillar, it self-registers with the `registry` pillar on boot (opt-in
via `POPS_REGISTRY_ENABLED`, using `bootstrapPillar` from `@pops/pillar-sdk`).
Its own manifest declares **empty** `routes`, `search`, `ai`, and `uri`
dimensions — it is an aggregator, not a domain owner.

## Layout

```
pillars/orchestrator/
├── package.json            @pops/orchestrator
├── Dockerfile
├── mise.toml               per-pillar tasks
└── src/
    ├── server.ts           HTTP entrypoint (port 3009)
    ├── app.ts              Express app factory + route wiring
    ├── handlers.ts         /health + /pillars handlers
    ├── manifest.ts         the orchestrator's own (empty-dimension) manifest
    ├── search/             POST /search — federated fan-out, merge, rank
    ├── ai-tools/           GET /ai/tools — manifest tool-list projection
    └── pillars/            GET /pillars — registry-first fleet view
```

## Commands

```bash
pnpm --filter @pops/orchestrator dev          # tsx watch on src/server.ts
pnpm --filter @pops/orchestrator typecheck     # tsc --noEmit
pnpm --filter @pops/orchestrator test          # vitest run
pnpm --filter @pops/orchestrator build         # tsc → dist/
pnpm --filter @pops/orchestrator start         # node dist/server.js
```

## Domain docs

See [docs/README.md](docs/README.md) for the full domain summary, discovery
semantics, and PRDs.
