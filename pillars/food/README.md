# @pops/food

The **food** pillar — recipes, ingredients, the cook/plan/shopping domain, the
inbox quality scorer, the recipe DSL, and the multimodal ingestion worker. A
standalone REST service that owns its own SQLite DB, serves a
[ts-rest](https://ts-rest.com) contract built from zod, runs a BullMQ ingest
worker, exports a `./manifest`, and self-registers with the `registry` pillar on
boot. Default port **3005** (override with `PORT`). Domain docs:
[docs/README.md](docs/README.md).

## Public surface

Food has the widest public surface of the pillars because it runs more than one
transport. **One public subpath per transport / wire concern:**

```jsonc
package.json
  "exports": {
    ".":          → src/contract/index.ts        // HTTP wire schemas + types
    "./manifest": → src/contract/manifest.ts     // pillar manifest
    "./api-types":→ src/contract/api-types.generated.ts
    "./queue":    → src/contract/queue/index.ts  // BullMQ queue payload schemas
    "./dsl":      → src/dsl/public.ts            // recipe DSL public API
    "./openapi":  → openapi/food.openapi.json    // OpenAPI 3 (HTTP only)
  }
```

A queue payload is a wire contract — same role as OpenAPI, just over Redis
instead of HTTP — so it gets its own `./queue` subpath rather than being
conflated with the synchronous request/response surface. Everything else
(`src/api/`, `src/db/`, `src/worker/`, `src/inbox/`, `src/seed/`, `src/domain/`)
is private — `ERR_PACKAGE_PATH_NOT_EXPORTED` at the Node resolver.

## Layout

```
pillars/food/
├── package.json            @pops/food
├── tsconfig.json
├── vitest.config.ts
├── Dockerfile              one image, two CMDs (api + worker)
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-food — FE feature module
├── openapi/
│   └── food.openapi.json   canonical HTTP wire contract (committed)
├── migrations/             drizzle journal
├── scripts/                codegen — manifest + openapi + api-types
└── src/
    ├── contract/   PUBLIC: ts-rest contract (rest.ts), HTTP schemas/types, manifest, queue/ subpath
    ├── api/        PRIVATE: Express server, ts-rest handlers, registry wiring
    ├── db/         PRIVATE: drizzle schema, migrations, services, the SQLite opener
    ├── dsl/        PRIVATE logic + `public.ts` (the `./dsl` export): recipe DSL parser/resolver/compiler
    ├── inbox/      PRIVATE: quality scoring helpers (pure)
    ├── seed/       PRIVATE: initial seed data
    ├── domain/     PRIVATE: shared types + utilities (slug, recipe-renderer)
    └── worker/     PRIVATE: BullMQ ingestion daemon
```

Boundaries inside the pillar: `db/` is literally drizzle + services + schema;
`dsl/` and `inbox/` are pure logic (no DB); `seed/` is fixture data; `domain/`
holds anything shared between subdirs; `worker/` runs the BullMQ daemon and
imports queue schemas relatively from `../contract/queue/`. The worker calls
back to the pillar over plain HTTP fetch — no typed-client coupling to any
server internals.

## Dockerfile — two CMDs, one image

A single multi-stage Dockerfile produces a single image; `docker compose`
selects the role per container:

```yaml
food-api:
  image: pops-food
  # default CMD: ["node", "dist/api/server.js"]
food-worker:
  image: pops-food
  command: ['node', 'dist/worker/worker.js']
```

Both processes share the same compiled artefact, dependencies, and migrations.
Building once and overriding `command:` in compose keeps the registry lean and
the layer cache warm across both roles.

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the API server registers via
`bootstrapPillar` from `@pops/pillar-sdk/bootstrap` (`/registry/register` on the
`registry` pillar) and deregisters on `SIGTERM`. There is no per-request auth:
the pillar trusts the docker network and the gateway in front authenticates.

## Commands

```bash
pnpm --filter @pops/food typecheck
pnpm --filter @pops/food test          # vitest against a real temp SQLite DB
pnpm --filter @pops/food build         # verify-manifest → tsc → openapi → api-types
pnpm --filter @pops/food dev:api       # tsx watch on the HTTP server
pnpm --filter @pops/food dev:worker    # tsx watch on the BullMQ ingest daemon
pnpm --filter @pops/food db:seed:food  # seed a local food DB
pnpm --filter @pops/food generate:openapi
pnpm --filter @pops/food generate:api-types
docker build -f pillars/food/Dockerfile .
```

The contract (zod) is the single source of truth; OpenAPI and api-types are
generated projections, drift-checked in CI. Redis is required to run the worker
(set `REDIS_URL`); the API degrades gracefully without it.
