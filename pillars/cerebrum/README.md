# @pops/cerebrum

The **cerebrum** pillar — the memory / retrieval / autonomous-agent surface
(engrams, retrieval, ingest/emit, plexus, reflex, glia, nudges, and the `ego`
conversational surface). A standalone REST service that owns its own SQLite DB,
serves a [ts-rest](https://ts-rest.com) contract built from zod, runs a worker,
exports a `./manifest`, and self-registers with the `registry` pillar on boot.
Port **3007**.

## Public surface

```jsonc
package.json
  "exports": {
    ".":          → src/contract/index.ts        // FE-safe types + zod schemas
    "./manifest": → src/contract/manifest.ts     // pillar manifest
    "./api-types":→ src/contract/api-types.generated.ts
    "./openapi":  → openapi/cerebrum.openapi.json // canonical wire contract
  }
```

The committed `openapi/cerebrum.openapi.json` is the wire-typed source for
polyglot + FE consumers. The contract (`src/contract/rest.ts`, zod) is the
single source of truth; OpenAPI and api-types are generated projections,
drift-checked in CI.

## Layout

```
pillars/cerebrum/
├── package.json            @pops/cerebrum
├── Dockerfile
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-cerebrum — FE feature module
├── docs/runbooks/cerebrum-rest-migration.md   domain-by-domain migration log
├── openapi/
│   └── cerebrum.openapi.json   generated projection of the contract
├── scripts/                verify-manifest, generate-openapi, generate-api-types
└── src/
    ├── contract/   PUBLIC: ts-rest contract (rest.ts), zod schemas/types, settings manifests, manifest
    ├── api/        PRIVATE: Express container — /health + /pillars probes + the ts-rest endpoints
    ├── db/         PRIVATE: SQLite schema + services + the sqlite-vec loader (openCerebrumDb)
    └── worker/     PRIVATE: background worker (needs Redis)
```

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the server registers via
`bootstrapPillar` from `@pops/pillar-sdk` (`/registry/register` on the
`registry` pillar) and deregisters on `SIGTERM`. There is no per-request auth:
the pillar trusts the docker network and the gateway in front authenticates.

## Commands

```bash
pnpm --filter @pops/cerebrum typecheck
pnpm --filter @pops/cerebrum test
pnpm --filter @pops/cerebrum build        # verify-manifest → tsc → openapi → api-types
pnpm --filter @pops/cerebrum dev          # tsx watch on src/api/server.ts
pnpm --filter @pops/cerebrum generate:openapi
pnpm --filter @pops/cerebrum generate:api-types
```

Redis is required to run the worker (set `REDIS_URL`); the API degrades
gracefully without it.
