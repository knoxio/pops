# @pops/food

The **food** pillar — third pilot of the collapsed-pillar shape, the first
with a worker. Self-contained workspace member that owns its HTTP API, queue
contract, persistence, recipe DSL, inbox quality scoring, seed data, and the
ingestion daemon behind a strict `exports` map.

## The rules — refinements from the lists + inventory pilots

```
package.json
  "exports": {
    ".":          → src/contract/index.ts        HTTP wire schemas + types
    "./manifest": → src/contract/manifest.ts     Pillar manifest
    "./queue":    → src/contract/queue/index.ts  BullMQ queue payload schemas
    "./openapi":  → openapi/food.openapi.json    OpenAPI 3 (HTTP only)
  }
```

Three public surfaces. New since lists: **`./queue`** — the BullMQ queue
contract is a wire surface like OpenAPI, just over Redis instead of HTTP.
**One public subpath per transport** is the lesson food adds to the
template — a pillar exposing only HTTP gets `.` + `./manifest`; a pillar
that also runs a queue adds `./queue`; future websocket pillars would
add `./ws`. Subpaths name the transport, not the domain.

`src/api/`, `src/db/`, `src/worker/`, `src/dsl/`, `src/inbox/`, `src/seed/`,
and `src/domain/` are all private — `ERR_PACKAGE_PATH_NOT_EXPORTED` at the
Node resolver.

## Layout

```
pillars/food/
├── package.json           @pops/food (single workspace member)
├── tsconfig.json
├── vitest.config.ts
├── Dockerfile             one image, two CMDs (api + worker)
├── README.md
├── openapi/
│   └── food.openapi.json  canonical HTTP wire contract (committed)
├── migrations/            drizzle journal
├── scripts/               codegen — manifest + openapi
└── src/
    ├── contract/   PUBLIC: HTTP schemas + types + manifest + queue/ subpath
    │   ├── index.ts
    │   ├── types/
    │   ├── schemas/
    │   ├── queue/         ← BullMQ payload schemas (the `./queue` export)
    │   ├── errors.ts
    │   ├── manifest.ts
    │   └── router.ts      (FoodRouter type-stub; do not export)
    ├── api/        PRIVATE: HTTP server, handlers, registry wiring
    ├── db/         PRIVATE: drizzle schema, migrations, services, opener
    ├── dsl/        PRIVATE: recipe DSL parser/resolver/compiler (pure logic)
    ├── inbox/      PRIVATE: quality scoring helpers (pure)
    ├── seed/       PRIVATE: initial seed data
    ├── domain/     PRIVATE: shared types + utilities (slug, recipe-renderer)
    └── worker/     PRIVATE: BullMQ ingestion daemon
```

Boundaries inside the pillar:

- **`db/`** is literally drizzle + services + schema.
- **`dsl/`** is pure logic — no drizzle, no DB.
- **`inbox/`** is pure scoring — operates on already-loaded data.
- **`seed/`** is fixture data.
- **`domain/`** holds anything shared between subdirs (slug grammar, plan
  types, recipe-renderer types).
- **`worker/`** runs the BullMQ daemon. Imports queue schemas relatively
  from `../contract/queue/`. Calls back to pops-api via raw HTTP fetch
  (no `@pops/api` typed-client coupling — the typed-tRPC pattern would
  tie the worker to a lake-broken monolith).

## Dockerfile — two CMDs, one image

Single multi-stage Dockerfile produces a single image. `docker-compose`
selects the role per container:

```yaml
food-api:
  image: pops-food
  # default CMD: ["node", "dist/api/server.js"]
food-worker:
  image: pops-food
  command: ['node', 'dist/worker/worker.js']
```

Both processes share the same compiled artefact, the same dependencies,
and the same migrations folder. Building once and `command:`-overriding
in compose keeps the registry lean and the build pipeline simple.

## Quality gates

`.github/workflows/food-quality.yml` — comprehensive single workflow.
Replaces three fragmented workflows (`food-api-quality.yml`,
`food-db-quality.yml`, `worker-food-image.yml`) the legacy split had.

Locally:

```
pnpm install --frozen-lockfile --filter "@pops/food..."
pnpm --filter @pops/food typecheck
pnpm --filter @pops/food test
pnpm --filter @pops/food build
pnpm exec oxfmt --check pillars/food/
pnpm exec oxlint pillars/food/src
docker build -f pillars/food/Dockerfile .
```

## Consumer migration (the deliberate part of the lake)

The food collapse migrates **only one consumer**: the 9 `apps/pops-api`
ingest files that share the BullMQ queue contract with the worker. They
rewrite `from '@pops/food-contracts'` → `from '@pops/food/queue'`.
Everything else stays broken until the pops-api retirement work or
explicit consumer migrations land.

What's still broken (lake of sludge):

- `apps/pops-api/src/modules/food/*` (everything except the 9 ingest
  files) — still imports `@pops/food-db`, `@pops/food-contract`,
  `@pops/app-food-db`. Unresolved by design; will resolve when each
  handler migrates to `@pops/food` or moves into `pillars/food/src/api/`.
- `packages/app-food` (FE) — imports `@pops/app-food-db`. Stays broken
  until the FE pillar collapse.
- `apps/pops-api` legacy worker callback (`food.ingest.workerComplete`)
  receives `IngestJobResult` shapes that now come from `@pops/food/queue`.
  The 9-file mechanical rewrite resolves this side specifically.

## Decision log

- **Why one image with two CMDs (not two images).** The API and the
  worker share 100% of the compiled artefact, all dependencies, and the
  migrations folder. Building one image keeps the registry simple and
  the docker layer cache warm across both roles.
- **Why drop `@pops/api` from the worker.** Typed tRPC clients coupled
  the worker's compilation to the monolith's `AppRouter` type. With
  pops-api in a lake-broken state, that coupling would red the food
  CI on every collapse. Raw fetch against the known `food.ingest.workerComplete`
  endpoint achieves the same effect without the compile-time leash.
- **Why queue contract is public (`./queue`).** A queue payload is a wire
  contract — same role as OpenAPI for HTTP. Different transport, same
  consumer-facing concern. Single `./` subpath would conflate two
  unrelated lifecycle models (synchronous request/response vs
  fire-and-forget enqueue).
- **Why no `step-lists.ts` in seed/.** Food previously wrote directly
  into the lists pillar's SQLite via shared workspace packages. With
  lists collapsed and its DB private, that import path is unreachable —
  correctly. Food list-item fixtures are deferred to a follow-up that
  goes through lists' public HTTP API.
- **Why `dsl/`, `inbox/`, `seed/`, `domain/` are separate from `db/`.**
  Honest categorisation: `db/` literally means drizzle calls. Pure
  logic (DSL compiler, inbox scoring), pure data (seed), and shared
  types (domain) all have homes outside `db/`. Reorganising later, if
  needed, is a contained internal refactor — the public surface stays
  identical.

## What this PR exposes about the rest of the codebase

Beyond the 9 sanctioned consumer-migration sites:

- **`apps/pops-api/src/modules/food/`** still hosts most of food's business
  logic. Moving it into `pillars/food/src/api/` is the pops-api retirement
  work, deferred to a later phase.
- **`packages/app-food`** depends on `@pops/app-food-db`. After this
  collapse, that's unresolved. The FE module either collapses into
  `pillars/food/src/fe/` or stays separate; that's a design call deferred
  to the FE pillar phase.
