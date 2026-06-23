# @pops/ai

The **ai** pillar — the platform's AI governance surface: providers, usage,
budgets, alerts, observability, and pricing. A standalone REST service that owns
its own SQLite DB (`ai.db`), serves a [ts-rest](https://ts-rest.com) contract
built from zod, exports a `./manifest`, and self-registers with the `registry`
pillar on boot. Port **3008**.

## Public surface

```jsonc
package.json
  "exports": {
    ".":          → src/contract/index.ts        // FE-safe types + zod schemas
    "./manifest": → src/contract/manifest.ts     // pillar manifest
    "./api-types":→ src/contract/api-types.generated.ts
    "./openapi":  → openapi/ai.openapi.json        // canonical wire contract
  }
```

The contract (`src/contract/rest.ts`, zod) is the single source of truth;
OpenAPI and api-types are generated projections, drift-checked in CI.

## Domains

`src/api/modules/` and the matching `src/contract/rest-ai-*.ts` files:

- `ai-providers` — registered model providers + credentials.
- `ai-usage` — per-call usage records (the ingest surface writes here).
- `ai-budgets` — spend budgets.
- `ai-alerts` — budget / anomaly alerts.
- `ai-observability` — traces and metrics.
- pricing + settings round out the contract.

## Layout

```
pillars/ai/
├── package.json            @pops/ai
├── Dockerfile              runs src/api/server.ts
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-ai — FE feature module
├── openapi/
│   └── ai.openapi.json     generated projection of the contract
├── scripts/                generate-openapi.ts, generate-api-types.ts
└── src/
    ├── contract/   PUBLIC: ts-rest contract, types, zod schemas, manifest
    ├── api/        PRIVATE: Express server, ts-rest handlers, modules, registry wiring
    └── db/         PRIVATE: drizzle schema + services + the ai.db opener
```

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the server registers via
`bootstrapPillar` from `@pops/pillar-sdk` (`/registry/register` on the
`registry` pillar) and deregisters on `SIGTERM`. It exposes `/health` and a
federated `/pillars` view. There is no per-request auth: the pillar trusts the
docker network and the gateway in front authenticates.

## Commands

```bash
pnpm --filter @pops/ai typecheck
pnpm --filter @pops/ai test
pnpm --filter @pops/ai build        # tsc + generate openapi + api-types
pnpm --filter @pops/ai dev          # tsx watch on src/api/server.ts
pnpm --filter @pops/ai generate:openapi
pnpm --filter @pops/ai generate:api-types
```
