# @pops/inventory

The **inventory** pillar — items, locations, warranties, and insurance. A
standalone REST service that owns its own SQLite DB, serves a
[ts-rest](https://ts-rest.com) contract built from zod, exports a `./manifest`,
and self-registers with the `registry` pillar on boot. Port **3002**.

A pillar is a **black box with a published wire contract**. Everything else is
private, enforced by Node's `exports` map.

## Public surface

```jsonc
package.json
  "exports": {
    ".":          → src/contract/index.ts        // FE-safe types + zod schemas
    "./manifest": → src/contract/manifest.ts     // pillar manifest
    "./api-types":→ src/contract/api-types.generated.ts
    "./openapi":  → openapi/inventory.openapi.json // canonical wire contract
  }
```

Only these resolve. `import '@pops/inventory/db'` or `import '@pops/inventory/api'`
throws `ERR_PACKAGE_PATH_NOT_EXPORTED` at the resolver — the boundary is enforced
by Node itself, no reviewer needed.

- **Types + zod schemas** for every entity that crosses the wire (`Item`,
  `Location`, `Warranty`, …) — `import { Item, ItemSchema } from '@pops/inventory'`.
- **The manifest** describing the pillar's nav contribution, settings
  dimensions, and contract pin — `import { inventoryManifest } from '@pops/inventory/manifest'`.
- **The OpenAPI 3 spec** at `openapi/inventory.openapi.json` — language-agnostic;
  non-TS consumers (Rust, Swift, Go) consume it directly.

## How consumers talk to inventory

Two supported call paths:

1. **TS consumers — the SDK proxy.** `pillar('inventory').items.list({ … })`
   via `@pops/pillar-sdk`. Types come from the contract's zod schemas, not from
   any server internals, so refactoring the server never breaks a consumer.
2. **Anyone else (Rust, Swift, plain fetch).** Consume
   `openapi/inventory.openapi.json` and call HTTP directly.

OpenAPI is the canonical wire contract; the TS types are a downstream view for
ergonomics.

## Layout

```
pillars/inventory/
├── package.json            @pops/inventory
├── tsconfig.json
├── vitest.config.ts
├── Dockerfile              runs src/api/server.ts
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-inventory — FE feature module
├── openapi/
│   └── inventory.openapi.json   canonical wire contract (committed)
├── migrations/             drizzle journal
├── scripts/                codegen — openapi + api-types
└── src/
    ├── contract/   PUBLIC: ts-rest contract, types, zod schemas, manifest, errors, settings
    ├── api/        PRIVATE: Express server, ts-rest handlers, registry wiring
    └── db/         PRIVATE: drizzle schema, migrations, services, the SQLite opener
```

Everything inside the pillar imports across subdirs using **relative paths**
(`../db/index.js`), never via the package name.

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the server calls `bootstrapPillar`
from `@pops/pillar-sdk`, which POSTs the manifest to the `registry` pillar
(`/registry/register`) and tears the entry down on `SIGTERM`. There is no
per-request auth: the pillar trusts the docker network and the gateway in front
authenticates.

## Commands

```bash
pnpm --filter @pops/inventory typecheck
pnpm --filter @pops/inventory test          # vitest against a real temp SQLite DB
pnpm --filter @pops/inventory build         # tsc + generate openapi + api-types
pnpm --filter @pops/inventory dev           # tsx watch on src/api/server.ts
pnpm --filter @pops/inventory generate:openapi
pnpm --filter @pops/inventory generate:api-types
docker build -f pillars/inventory/Dockerfile .
```

## Codegen

- `generate:openapi` — regenerates `openapi/inventory.openapi.json` from the
  contract's zod schemas. CI gates on drift.
- `generate:api-types` — regenerates `src/contract/api-types.generated.ts` from
  the OpenAPI projection. CI gates on drift.

The contract (zod) is the single source of truth; OpenAPI and api-types are
generated projections. No hand-authored OpenAPI, no hand-authored paths.
