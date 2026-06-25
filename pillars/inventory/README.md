# @pops/inventory

The **inventory** pillar — items, locations, warranties, and insurance. A
standalone REST service that owns its own SQLite DB, serves a
[ts-rest](https://ts-rest.com) contract built from zod, exports a `./manifest`,
and self-registers with the `registry` pillar on boot. Port **3002**.

A pillar is a **black box with a published wire contract**. Everything else is
private, enforced by Node's `exports` map.

## Public surface

The `exports` map ships compiled `dist/contract/**`; the source it is built from
lives in `src/contract/`:

```jsonc
package.json
  "exports": {
    ".":           dist/contract/index.js            // FE-safe types + zod schemas
    "./manifest":  dist/contract/manifest.js         // pillar manifest
    "./api-types": dist/contract/api-types.generated.js
    "./openapi":   openapi/inventory.openapi.json     // canonical wire contract
  }
```

Only these resolve. `import '@pops/inventory/db'` or `import '@pops/inventory/api'`
throws `ERR_PACKAGE_PATH_NOT_EXPORTED` at the resolver — the boundary is enforced
by Node itself, no reviewer needed.

- **Types + zod schemas** for every entity that crosses the wire (`Item`,
  `Location`, `Warranty`, …) — `import { Item, ItemSchema } from '@pops/inventory'`.
- **The manifest** — `id`, `name`, `version`, `surfaces: ['app']`, `description`,
  and the pillar's `settings` dimensions, consumed by the `registry` on
  self-registration — `import { inventoryManifest } from '@pops/inventory/manifest'`.
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
├── Dockerfile              CMD node dist/api/server.js
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
pnpm --filter @pops/inventory typecheck     # tsc --noEmit (src + scripts)
pnpm --filter @pops/inventory test          # vitest against a real temp SQLite DB
pnpm --filter @pops/inventory build         # verify manifest → tsc -b → openapi → api-types
pnpm --filter @pops/inventory dev           # tsx watch on src/api/server.ts
pnpm --filter @pops/inventory start         # node dist/api/server.js
pnpm --filter @pops/inventory generate:openapi
pnpm --filter @pops/inventory generate:api-types
pnpm --filter @pops/inventory generate:manifest
docker build -f pillars/inventory/Dockerfile .
```

The same tasks are exposed through `mise.toml` (`mise run build`, `mise run test`,
`mise run lint`) for per-pillar federation.

## Codegen

- `generate:openapi` — regenerates `openapi/inventory.openapi.json` from the
  contract's zod schemas. CI gates on drift.
- `generate:api-types` — regenerates `src/contract/api-types.generated.ts` from
  the OpenAPI projection. CI gates on drift.
- `generate:manifest` — regenerates `src/contract/manifest.generated.ts`;
  `verify:manifest` (run first in `build`) fails the build on drift.

The contract (zod) is the single source of truth; OpenAPI, api-types, and the
generated manifest are downstream projections. No hand-authored OpenAPI, no
hand-authored paths.

## Domain docs

The inventory domain — items, locations, the connection graph, warranties,
Paperless-ngx links, and insurance reporting — is documented in
[docs/README.md](docs/README.md), with one PRD per feature under
[docs/prds/](docs/prds/).
