# @pops/registry

The **registry** pillar — the single source of truth for which pillars are
currently running, plus settings, users, service accounts, features, and URI
resolution. Every other pillar self-registers here on boot; the registry is the
one place the federation looks to enumerate live surfaces. Port **3001**.

> The registry was formerly named `core` (`pops-core` / `core-api`). Its
> container answers to both the new `registry-api` name and the legacy
> `core-api` network alias during the rename rollout window, so older pillar
> images still resolve it.

It is itself a pillar: it owns its own SQLite DB, serves a
[ts-rest](https://ts-rest.com) contract built from zod, and exports a
`./manifest`. It does not register with itself.

## Public surface

```jsonc
package.json
  "exports": {
    ".":          → src/contract/index.ts        // FE-safe types + zod schemas
    "./manifest": → src/contract/manifest.ts     // pillar manifest
    "./api-types":→ src/contract/api-types.generated.ts
    "./openapi":  → openapi/registry.openapi.json // canonical wire contract
  }
```

The contract (`src/contract`, zod) is the single source of truth; OpenAPI and
api-types are generated projections, drift-checked in CI.

## The registration endpoints

Pillars register through `@pops/pillar-sdk`'s `bootstrapPillar`, which POSTs the
manifest to the registry. The registry serves both the canonical and the legacy
path so an old-SDK pillar still resolves during a rolling deploy:

| Concern    | Canonical                   | Legacy                           |
| ---------- | --------------------------- | -------------------------------- |
| register   | `POST /registry/register`   | `POST /core.registry.register`   |
| heartbeat  | `POST /registry/heartbeat`  | `POST /core.registry.heartbeat`  |
| deregister | `POST /registry/deregister` | `POST /core.registry.deregister` |

A registration envelope is `{ pillarId, baseUrl, manifest, apiKey }` where
`manifest.pillar` MUST equal `pillarId` (mismatch is rejected). Consumers
subscribe to registry changes over Server-Sent Events at
`GET /registry/subscribe` (`pillar.registered`, `pillar.deregistered`,
`pillar.health-changed`, with an initial `pillar.snapshot`). Probes:
`GET /health` and a federated `GET /pillars`.

## Modules

`src/api/modules/`:

- `registry` — the live pillar registry (boot, event bus, eviction ticker,
  snapshot, SSE subscribe).
- `external-registry` — the register/heartbeat/deregister handlers external
  pillars call.
- `service-accounts` — service-account keys used for inter-pillar auth.
- `features` — feature flags.
- `uri` — URI type resolution.

## Layout

```
pillars/registry/
├── package.json            @pops/registry
├── Dockerfile              runs src/api/server.ts
├── mise.toml               per-pillar tasks
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
pnpm --filter @pops/registry typecheck
pnpm --filter @pops/registry test
pnpm --filter @pops/registry build        # tsc + generate openapi + api-types
pnpm --filter @pops/registry dev          # tsx watch on src/api/server.ts
pnpm --filter @pops/registry generate:openapi
pnpm --filter @pops/registry generate:api-types
```
