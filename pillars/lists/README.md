# @pops/lists

The **lists** pillar — generic lists (shopping, packing, todo; food is the
first consumer). A standalone REST service that owns its own SQLite DB, serves
a [ts-rest](https://ts-rest.com) contract built from zod, exports a
`./manifest`, and self-registers with the `registry` pillar on boot. Port
**3006**.

A pillar is a **black box with a published wire contract**. Everything else is
private, enforced by Node's `exports` map.

## Public surface

```jsonc
package.json
  "exports": {
    ".":          → src/contract/index.ts        // FE-safe types + zod schemas
    "./manifest": → src/contract/manifest.ts     // pillar manifest
    "./api-types":→ src/contract/api-types.generated.ts
    "./openapi":  → openapi/lists.openapi.json    // canonical wire contract
  }
```

Only these resolve. `import '@pops/lists/db'` or `import '@pops/lists/api'`
throws `ERR_PACKAGE_PATH_NOT_EXPORTED` at the resolver — the boundary is enforced
by Node itself.

- **Types + zod schemas** for every entity that crosses the wire (`List`,
  `ListItem`, …) — `import { ListItem, ListItemSchema } from '@pops/lists'`.
- **The manifest** describing the pillar's nav contribution and contract pin —
  `import { listsManifest } from '@pops/lists/manifest'`.
- **The OpenAPI 3 spec** at `openapi/lists.openapi.json` — language-agnostic;
  non-TS consumers (Rust, Swift, Go) consume it directly.

## How consumers talk to lists

Two supported call paths:

1. **TS consumers — the SDK proxy.** `pillar('lists').list.create({ … })` via
   `@pops/pillar-sdk`. Types come from the contract's zod schemas, so
   refactoring the server never breaks a consumer.
2. **Anyone else (Rust, Swift, plain fetch).** Consume
   `openapi/lists.openapi.json` and call HTTP directly.

OpenAPI is the canonical wire contract; the TS types are a downstream view for
ergonomics.

## Layout

```
pillars/lists/
├── package.json            @pops/lists
├── tsconfig.json
├── vitest.config.ts
├── Dockerfile              runs src/api/server.ts
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-lists — FE feature module
├── openapi/
│   └── lists.openapi.json  canonical wire contract (committed)
├── migrations/             drizzle journal
├── infra/
│   └── litestream.yml      SQLite replication config (reference)
├── scripts/                codegen — openapi + api-types
└── src/
    ├── contract/   PUBLIC: ts-rest contract (rest.ts), types, zod schemas, manifest, errors
    ├── api/        PRIVATE: Express server, ts-rest handlers, registry wiring
    └── db/         PRIVATE: drizzle schema, migrations, services, the SQLite opener
```

Everything inside the pillar imports across subdirs using **relative paths**
(`../db/index.js`), never via the package name.

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the server calls `bootstrapPillar`
from `@pops/pillar-sdk`, which POSTs the manifest to the `registry` pillar
(`/registry/register`) and deregisters on `SIGTERM`. There is no per-request
auth: the pillar trusts the docker network and the gateway in front
authenticates.

## Commands

```bash
pnpm --filter @pops/lists typecheck
pnpm --filter @pops/lists test          # vitest against a real temp SQLite DB
pnpm --filter @pops/lists build         # tsc + generate openapi + api-types
pnpm --filter @pops/lists dev           # tsx watch on src/api/server.ts
pnpm --filter @pops/lists generate:openapi
pnpm --filter @pops/lists generate:api-types
docker build -f pillars/lists/Dockerfile .
```

## Codegen

The contract (zod) is the single source of truth. `generate:openapi`
regenerates `openapi/lists.openapi.json` from the contract's zod schemas;
`generate:api-types` regenerates `src/contract/api-types.generated.ts` from
that OpenAPI projection. CI gates on drift for both — no hand-authored OpenAPI,
no hand-authored paths.
