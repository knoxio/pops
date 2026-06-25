# @pops/cerebrum

The **cerebrum** pillar — the memory / retrieval / autonomous-agent surface
(engrams, retrieval, ingest/emit, plexus, reflex, glia, nudges, and the `ego`
conversational surface). A standalone REST service that owns its own SQLite DB,
serves a [ts-rest](https://ts-rest.com) contract built from zod, runs a worker,
exports a `./manifest`, and self-registers with the `registry` pillar on boot.
Port **3007**.

Domain docs (theme, components, scope model, success criteria): [`docs/README.md`](docs/README.md).

## Public surface

```jsonc
package.json
  "exports": {
    ".":          → src/contract/index.ts        // FE-safe wire types + zod schemas
    "./manifest": → src/contract/manifest.ts     // ModuleManifest values (cerebrum + ego)
    "./api-types":→ src/contract/api-types.generated.ts
    "./openapi":  → openapi/cerebrum.openapi.json // canonical wire contract
  }
```

The committed `openapi/cerebrum.openapi.json` is the wire-typed source for
polyglot + FE consumers. The contract (`src/contract/rest.ts`, zod) is the
single source of truth; OpenAPI and api-types are generated projections,
drift-checked in CI.

`ego` is co-located here (it has no contract of its own); its settings nest
under cerebrum, so the pillar exports both `cerebrumManifest` and `egoManifest`.

## Layout

```
pillars/cerebrum/
├── package.json            @pops/cerebrum
├── Dockerfile
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-cerebrum — FE feature module
├── docs/                   domain docs (theme, PRDs, architecture)
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
`registry` pillar) and deregisters on `SIGTERM`. The heartbeat reports the live
`cerebrum.vectorSearch` capability (whether sqlite-vec loaded on this
connection) and advertises the pillar's federated `/settings/*` surface. There
is no per-request auth: the pillar trusts the docker network and the gateway in
front authenticates.

## Commands

```bash
pnpm --filter @pops/cerebrum typecheck
pnpm --filter @pops/cerebrum test
pnpm --filter @pops/cerebrum build         # verify-manifest → tsc → openapi → api-types
pnpm --filter @pops/cerebrum dev           # tsx watch on src/api/server.ts
pnpm --filter @pops/cerebrum start         # node dist/api/server.js
pnpm --filter @pops/cerebrum start:worker  # node dist/worker/index.js
pnpm --filter @pops/cerebrum generate:openapi
pnpm --filter @pops/cerebrum generate:api-types
```

Redis is required to run the worker (set `REDIS_URL`); the API degrades
gracefully without it.
