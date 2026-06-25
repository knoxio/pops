# @pops/ai

The **ai** pillar — the platform's AI governance surface: providers, usage,
budgets, alerts, observability, and pricing. A standalone REST service that owns
its own SQLite DB (`ai.db`), serves a [ts-rest](https://ts-rest.com) contract
built from zod, exports a `./manifest`, and self-registers with the `registry`
pillar on boot. Port **3008**. Domain docs: [`docs/README.md`](docs/README.md).

## Public surface

The package ships only its contract surface (`dist/contract/**` + the OpenAPI
snapshot). `exports`:

| Subpath       | Built from                            | Use                                 |
| ------------- | ------------------------------------- | ----------------------------------- |
| `.`           | `src/contract/index.ts`               | `aiContract` router + FE-safe types |
| `./manifest`  | `src/contract/manifest.ts`            | `aiManifest` `ModuleManifest`       |
| `./api-types` | `src/contract/api-types.generated.ts` | generated OpenAPI TS types          |
| `./openapi`   | `openapi/ai.openapi.json`             | canonical wire contract (JSON)      |

The contract (`src/contract/rest.ts`, zod) is the single source of truth;
the OpenAPI JSON and `api-types` are generated projections, drift-checked in CI.

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
├── Dockerfile              runs dist/api/server.js
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
`bootstrapPillar` from `@pops/pillar-sdk/bootstrap` (`POST /registry/register`
on the `registry` pillar) and deregisters on `SIGTERM`/`SIGINT`. It exposes
`/health`, a federated `/pillars` view, and the raw `/openapi` document.

Most routes trust the docker network and the gateway in front of it. The one
exception is the cross-pillar ingest `POST /ai-usage/record`: nginx never
proxies it, and it 403s any request missing the shared `x-pops-internal-token`,
so only sibling pillars carrying that token can write usage. The pricing read
`GET /ai-pricing/:provider/:model` stays open so callers can shape cost before
recording.

## Commands

```bash
pnpm --filter @pops/ai typecheck
pnpm --filter @pops/ai test
pnpm --filter @pops/ai build        # tsc + generate openapi + api-types
pnpm --filter @pops/ai dev          # tsx watch on src/api/server.ts
pnpm --filter @pops/ai generate:openapi
pnpm --filter @pops/ai generate:api-types
```
