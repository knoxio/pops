# @pops/finance

The **finance** pillar — transactions, budgets, wishlists, entities, CSV import,
tag rules/suggestions, and AI-assisted corrections. A standalone REST service
that owns its own SQLite DB (`finance.db`, opened via `openFinanceDb`), serves a
[ts-rest](https://ts-rest.com) contract built from zod, exports a `./manifest`,
and self-registers with the `registry` pillar on boot. Port **3004**.

## Public surface

```jsonc
package.json
  "exports": {
    ".":          → src/contract/index.ts        // FE-safe types + zod schemas
    "./manifest": → src/contract/manifest.ts     // pillar manifest
    "./api-types":→ src/contract/api-types.generated.ts
    "./openapi":  → openapi/finance.openapi.json  // canonical wire contract
  }
```

The wire surface is the ts-rest contract (`src/contract/rest.ts`). It is the
single source of truth:
`pnpm -F @pops/finance generate:openapi` projects it to
`openapi/finance.openapi.json`, and `generate:api-types` projects that JSON to
`src/contract/api-types.generated.ts`. No hand-authored OpenAPI, no
hand-authored paths; CI gates on drift.

## Domains

| Domain         | Routes                                                        |
| -------------- | ------------------------------------------------------------- |
| `transactions` | `/transactions`, `/transactions/:id`, `/transactions/restore` |
| `budgets`      | `/budgets`, `/budgets/:id`                                    |
| `wishlist`     | `/wishlist`, `/wishlist/:id`                                  |
| `imports`      | CSV import                                                    |
| `tag-rules`    | tag rules + suggester                                         |
| `corrections`  | AI-assisted correction proposals (+ AI cache)                 |
| `entities`     | entity usage                                                  |
| `search`       | cross-domain search                                           |
| `settings`     | per-pillar settings                                           |

## Layout

```
pillars/finance/
├── package.json            @pops/finance
├── Dockerfile              runs src/api/server.ts
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-finance — FE feature module
├── openapi/
│   └── finance.openapi.json   generated projection of the contract
├── scripts/                generate-openapi.ts, generate-api-types.ts
└── src/
    ├── contract/   PUBLIC: ts-rest contract, types, zod schemas, manifest
    ├── api/        PRIVATE: Express server, ts-rest handlers, registry wiring
    └── db/         PRIVATE: drizzle schema + services + openFinanceDb
```

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the server registers via
`bootstrapPillar` from `@pops/pillar-sdk` (`/registry/register` on the
`registry` pillar) and deregisters on `SIGTERM`. There is no per-request auth:
the pillar trusts the docker network and the gateway in front authenticates.

## Commands

```bash
pnpm --filter @pops/finance typecheck
pnpm --filter @pops/finance test          # vitest — db services + REST integration (supertest)
pnpm --filter @pops/finance build         # tsc + generate openapi + api-types
pnpm --filter @pops/finance dev           # watch-run the API server
pnpm --filter @pops/finance generate:openapi
pnpm --filter @pops/finance generate:api-types
```
