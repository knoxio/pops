# @pops/registry

The **registry** pillar — the single source of truth for which pillars are
currently running, plus settings, features, users, service accounts, and URI
resolution. Every other pillar self-registers here on boot, so the registry is
the one place the federation looks to enumerate live surfaces. Default port
**3001** (override with `PORT`).

It is itself a pillar: it owns its own SQLite DB, serves a
[ts-rest](https://ts-rest.com) contract built from zod, and exports a
`./manifest` with id `registry`. When `POPS_REGISTRY_ENABLED=true` it runs the
same bootstrap handshake every other pillar uses, pointed at its own localhost
endpoint — it registers with itself.

## Public surface

The published exports (`package.json`) point at the built `dist/contract`
output:

| Export        | Target                                 | What it is                     |
| ------------- | -------------------------------------- | ------------------------------ |
| `.`           | `dist/contract/index.js`               | FE-safe types + zod schemas    |
| `./manifest`  | `dist/contract/manifest.js`            | runtime `ModuleManifest` value |
| `./api-types` | `dist/contract/api-types.generated.js` | generated typed client surface |
| `./openapi`   | `openapi/registry.openapi.json`        | canonical wire contract (JSON) |

The ts-rest contract under `src/contract` (zod) is the single source of truth;
the OpenAPI JSON and `api-types` are generated projections, drift-checked in CI.

## REST surface

Every domain is served REST through one ts-rest contract (`src/contract/rest.ts`),
mounted root-relative: `features`, `serviceAccounts`, `settings`, `shell`, and
`users`.

## Discovery and registration

Pillars register through `@pops/pillar-sdk`'s `bootstrapPillar`, which POSTs the
manifest to the registry. Each handshake route is dual-served: the canonical
slash path and a legacy dotted alias point at the **same** handler instance, so
old- and new-SDK pillars register through identical logic.

| Concern    | Canonical                   | Legacy alias                     |
| ---------- | --------------------------- | -------------------------------- |
| register   | `POST /registry/register`   | `POST /core.registry.register`   |
| heartbeat  | `POST /registry/heartbeat`  | `POST /core.registry.heartbeat`  |
| deregister | `POST /registry/deregister` | `POST /core.registry.deregister` |
| snapshot   | `GET  /registry/pillars`    | `GET  /core.registry.list`       |

A registration envelope is `{ pillarId, baseUrl, manifest, capabilities? }`
where `manifest.pillar` MUST equal `pillarId` (a mismatch is rejected).
Consumers stream registry changes over Server-Sent Events at
`GET /registry/subscribe`: an initial `pillar.snapshot` frame, then
`pillar.registered`, `pillar.deregistered`, and `pillar.health-changed` frames.

Additional raw HTTP routes that ts-rest cannot model:

- `GET /health` — liveness probe.
- `GET /pillars` — the live pillar registry.
- `GET /pillars/health` — aggregated cross-pillar health, fanned out to every
  registered pillar.
- `POST /uri/resolve` — cross-pillar URI dispatcher (resolves in-process or
  proxies to the owning pillar).
- `GET /openapi` — serves the committed OpenAPI projection verbatim so the
  pillar SDK can build its route map from the live pillar.

## Modules

`src/api/modules/`:

- `registry` — the live pillar registry (boot reconcile, event bus, heartbeat
  and eviction tickers, snapshot, SSE subscribe).
- `external-registry` — the register / heartbeat / deregister handlers external
  pillars call.
- `features` — feature flags, including capability-scoped features and key
  ownership enforcement.
- `service-accounts` — service-account keys used for inter-pillar auth.
- `uri` — URI type parsing and resolution.

## Layout

```
pillars/registry/
├── package.json            @pops/registry
├── Dockerfile              runs dist/api/server.js
├── mise.toml               per-pillar tasks
├── migrations/             SQLite schema migrations
├── openapi/
│   └── registry.openapi.json   generated projection of the contract
├── scripts/                generate-openapi.ts, generate-api-types.ts
└── src/
    ├── contract/   PUBLIC: ts-rest contract, types, zod schemas, manifest
    ├── api/        PRIVATE: Express server, ts-rest handlers, the registry modules
    └── db/         PRIVATE: drizzle schema + services + the SQLite opener
```

## Commands

```bash
pnpm --filter @pops/registry typecheck    # tsc --noEmit (src + scripts)
pnpm --filter @pops/registry test         # vitest run
pnpm --filter @pops/registry build        # tsc -b + generate openapi + api-types
pnpm --filter @pops/registry dev          # tsx watch on src/api/server.ts
pnpm --filter @pops/registry start        # node dist/api/server.js
pnpm --filter @pops/registry generate:openapi
pnpm --filter @pops/registry generate:api-types
```
