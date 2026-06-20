# Core pillar migration — split tRPC (monolith + pops-core-api) → collapsed REST pillar

Goal: bring `core` to the same end state as the six leaves (`lists`, `inventory`,
`finance`, `food`, `media`, `cerebrum`) — a collapsed `pillars/core/` (`@pops/core`,
port **3001**) that serves REST from a ts-rest contract, with an honest OpenAPI
projection, a Hey API FE client for `app-ai`, scoped CI (`core-quality.yml`) green,
the dead `@pops/core-*` package names banned, **and `apps/pops-core-api` retired**.

Follow the generic recipe in [`pillar-rest-migration.md`](../../../../docs/runbooks/pillar-rest-migration.md)
and the worked [`finance`](../../../finance/docs/runbooks/finance-rest-migration.md) /
[`cerebrum`](../../../cerebrum/docs/runbooks/cerebrum-rest-migration.md) examples; this doc records only what is
**different** for core. **Core is the last pillar, and unlike the six leaves it is
the hub** — the registry every other pillar reads, the URI resolver, the cross-pillar
settings surface, the AI-ops platform. It is also already **half-migrated**
(`pops-core-api` exists) and is the convergence point for code that does **not** belong
to it. Read the scope decision and the precursors before slicing.

## Starting state (today)

Core is split across **four** locations — there is no `pillars/core/` yet:

| Where                                            | What                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/pops-core-api` (port 3001)                 | the live registry container (tRPC). `coreRouter = { registry, serviceAccounts, settings, users }` at `/trpc`; raw-HTTP `/health`, `/pillars`, `/registry/subscribe` (SSE), `/core.registry.{register,heartbeat,deregister}`. Heartbeat + eviction tickers, `bootstrapPillar`, `reconcileRegistryOnBoot`. |
| `apps/pops-api/src/modules/core` (142 .ts)       | the bulk — **15 tRPC routers** + the Express `envs` router + the `pillars`/`uri` dispatcher internals, still in the monolith.                                                                                                                                                                            |
| `packages/core-db` (`@pops/core-db`)             | **15 tables** (`settings`, `user_settings`, `service_accounts`, `pillar_registry`, `entities`, `environments`, `ai_*` ×8, `sync_job_results`) + services. Barrel-only export.                                                                                                                            |
| `packages/core-contract` (`@pops/core-contract`) | settings manifests (`aiConfigManifest`, `coreOperationalManifest`), zod schemas, **opaque `CoreRouter = AnyTRPCRouter`**, committed `openapi/core.openapi.json`, `./manifest` + `./settings` exports.                                                                                                    |

**Monolith `modules/core/` domain inventory** (`.ts` / tRPC procedures):

| Domain             | Files | Procs | Notes                                                                                                            | Disposition (see Scope)              |
| ------------------ | ----: | ----: | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `settings`         |     6 |     6 | **duplicated** — also in `pops-core-api`. The cross-pillar SDK surface (PRD-247).                                | **IN** core                          |
| `ai-usage`         |     6 |     5 | metering. `protectedProcedure`.                                                                                  | **IN** core                          |
| `ai-budgets`       |     4 |     3 | budget enforcement.                                                                                              | **IN** core                          |
| `ai-providers`     |     3 |     4 | provider config.                                                                                                 | **IN** core                          |
| `ai-alerts`        |    15 |    10 | alert CRUD + scheduler. **Reads `@pops/cerebrum-db` `nudgeLog`** (one dispatcher).                               | **IN** core (rewire cerebrum read)   |
| `ai-observability` |    14 |     4 | sinks + summary scheduler.                                                                                       | **IN** core                          |
| `entities`         |     7 |     5 | shared owner records. The `entities` **table** is core-owned; the **join to `finance.transactions`** is not.     | **IN** core (table); join → finance  |
| `envs`             |     5 |     0 | Express router (`environments` table).                                                                           | **IN** core                          |
| `features`         |     9 |     6 | feature flags. Reads `ctx.user`.                                                                                 | **IN** core                          |
| `shell`            |     1 |     1 | shell helper.                                                                                                    | **IN** core                          |
| `pillars`          |     8 |     0 | registry internals + `/uri/resolve` dispatcher + `/pillars/health` aggregator (Express).                         | **IN** core (fold uri into registry) |
| `uri`              |     7 |     1 | URI dispatcher.                                                                                                  | fold into **registry**               |
| `corrections`      |    29 |    16 | **misnamed finance** — reads `finance.db` via `getFinanceDrizzle()`.                                             | **RECLAIM → finance** (08a)          |
| `tag-rules`        |     6 |     5 | **misnamed finance** — reads `finance.db`.                                                                       | **RECLAIM → finance** (08a)          |
| `search`           |    10 |     7 | cross-pillar aggregator. Build-time `ADAPTER_BINDINGS` static imports.                                           | **SPLIT → `pops-orchestrator`** (06) |
| `embeddings`       |     5 |     3 | pipeline. Service path uses `pillar('cerebrum')`; **job path reads `pops.db` raw SQL + `getCerebrumDrizzle()`**. | **SPLIT → orchestrator / cerebrum**  |
| `jobs`             |     4 |     7 | queue stats over SYNC/EMBEDDINGS/CURATION/DEFAULT/DEAD_LETTER. Cross-pillar pipelines vs core-local schedulers.  | **SPLIT** (see Scope)                |

- **FE**: there is **no `app-core`**. `packages/app-ai` (`@pops/app-ai`) is the AI-Ops UI
  **shell over the `core` pillar** — 8 files, ~37 `usePillar('core')` hooks (17 query / 10
  mutation / 10 utils), still **tRPC** (no Hey API client). Settings UI consumers also ride
  the `core` handle.
- **Auth**: `service-accounts` is `userOnly` (admin CLI/MCP, reads `ctx.user.email`);
  `settings` + `ai-usage` are `protectedProcedure`; `corrections` + `features` read
  `ctx.user`. The rest take no identity.
- **Worker**: no `pops-worker-core`. Core's BullMQ queues run **in-process in the
  `pops-api` monolith** (`apps/pops-api/src/jobs/`), with `ai-alerts` / `ai-log-retention`
  / `ai-observability-summary` schedulers registered at monolith boot.
- **Registry topology**: `/pillars` is served by `core-api:3001`, but `/pillars/health`
  (the fan-out aggregator) and `/uri/resolve` are **still on the `pops-api` monolith**
  (`apps/pops-api/src/routes/pillars.ts`). They must move into the pillar.

## Scope (confirmed) — `pillars/core/` is the **platform/registry** pillar only

Core does not absorb the cross-pillar orchestrators. Three buckets:

- **IN `pillars/core/`** — the platform surfaces: **registry** (register / heartbeat /
  deregister / subscribe / snapshot / eviction / reconciliation, **+ `uri/resolve` folded
  in**, **+ `/pillars/health` aggregator** moved off the monolith), **settings** (incl. the
  PRD-247 cross-pillar `getMany`/`setMany` surface), **service-accounts**, **users**,
  **ai-ops** (`ai-usage` / `ai-budgets` / `ai-providers` / `ai-alerts` /
  `ai-observability` + their core-local schedulers), **entities** (table + CRUD),
  **envs**, **features**, **shell**.
- **RECLAIMED → `pillars/finance/`** (epic 08a, **precursor**): `corrections`, `tag-rules`,
  and the `entities`↔`transactions` join. Core never carries them; this removes core's
  only direct `finance.db` reads.
- **SPLIT OUT** (epic 08b / ADR-029, **precursor**): `search` + the AI-tool registry →
  a new **`pops-orchestrator`** container (epics 06 / 07); `uri` resolution → folded into
  the **core registry** surface (PRD-211); the cross-pillar **embeddings** pipeline +
  `curation` queue → orchestrator (or cerebrum, which owns `embeddings_vec` + the
  embedding-client). Core keeps only its **core-local** schedulers and the queue infra they
  need.

## What makes core different (read before slicing)

1. **It is the registry.** `pillars/core/` hosts the directory every other pillar reads;
   it **boots first** (`depends_on: core-api`), it can't discover itself the normal way
   (the synthetic `core` self-entry in `pillar-registry-client.ts` stays), and it serves
   the **SSE** `/registry/subscribe` stream + raw-HTTP `register`/`heartbeat`/`deregister`.
   Keep these as **Express routes mounted in the pillar** (they are not ts-rest shapes),
   registered before `createExpressEndpoints`. The outage drill in
   [`core-api-pillar-verification.md`](./core-api-pillar-verification.md) is the acceptance
   bar — re-run it after the collapse.
2. **It is already half-migrated.** Unlike the leaves, Phase 0 is a **consolidation**, not
   a from-scratch move: fold the four `pops-core-api` routers + the platform slice of
   `modules/core` into `pillars/core/`, then **retire `apps/pops-core-api`** (its
   `apps/pops-*-api` shape is the predecessor the leaves already replaced) **and** delete the
   monolith `modules/core`. Collapse the **settings duplication** (monolith + core-api) to one.
3. **Auth is NOT dropped globally.** `service-accounts` stays `userOnly` (admin CLI/MCP);
   `settings` writes and `features` are identity-aware. The dispatcher authenticates and
   forwards the user (signed `x-pops-user`), a pillar middleware reconstructs `ctx.user`
   for those surfaces — the cerebrum identity-middleware pattern. Non-identity ai-ops /
   entities / envs trust the docker net.
4. **The server-side REST transport is unfinished — this is the hard precursor.**
   `@pops/pillar-sdk` still builds **tRPC-shaped** `${baseUrl}/trpc/<dotted.path>` POST
   URLs and decodes tRPC error envelopes; discovery hits `/trpc/core.registry.list`. The
   collapsed pillars mount REST at **root** and serve no `/trpc/`. Only **media** has a
   `/<pillar>-api/` nginx REST route. Core sits on **both ends** of the cross-pillar graph
   (peers call `pillar('core').{settings,users}.*`; the registry/uri call peers), so cutting
   nginx to REST before pillar-sdk speaks REST breaks the whole mesh. **The REST transport +
   generalized `/<pillar>-api/` dispatcher must land first.**
5. **Core publishes the cross-pillar settings SDK (PRD-247)** consumed by media/inventory/
   finance — `get/set/ensure/delete/getMany/setMany`, with `getMany` batching on hot Plex
   paths. It must keep serving this **over REST** through the cutover; it is core's Phase B
   generic primitive (already designed).
6. **`@pops/core-db` / `@pops/core-contract` cannot be deleted at tail.** Unlike
   `media-contract`, they are still imported by **finance** (`entities`, `ENTITY_TYPES`) and
   **food** (`aiInferenceLog`) pillar schemas, by **inventory** (type-only `CoreRouter`), and
   by the monolith. Their deletion is gated on **PRD-245 US-07** (relocate core-owned schemas
   so peers stop importing `@pops/core-db`). Keep the packages alive through Phase C; the ban
   lands only after PRD-245.
7. **`pops.db` is still mounted** (`apps/pops-api/src/db.ts`, 36 `getDrizzle()` callers).
   The split-out embeddings job reads peer source rows via raw SQL on `pops.db`; this is
   gated on **epic 09**. Platform-core itself does **not** read `pops.db` once its own tables
   are on `core.db` — so core's collapse is not blocked on epic 09, but the **orchestrator
   split** is.

## Precursors (land before core's REST cutover)

Core is the only pillar with real upstream prerequisites. Do not start Phase 0 collapse
until these are sequenced:

| #   | Precursor                                                                                                                                                                                                                      | Owns / gates                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| C1  | **Reclaim finance code** — move `corrections` + `tag-rules` + the `entities`↔`transactions` join into `pillars/finance` (epic 08a).                                                                                            | Removes core's direct `finance.db` reads.              |
| C2  | **Split orchestration** — stand up `pops-orchestrator`; move `search` (registry-driven federation, epic 06) + AI-tool registry (epic 07) + the cross-pillar `embeddings`/`curation` pipeline there (or embeddings → cerebrum). | Defines core's boundary; ADR-029.                      |
| C3  | **Fold `uri` resolution into the registry** (PRD-211) — `/uri/resolve` becomes a registry function served by core.                                                                                                             | Removes the standalone `uri` module.                   |
| C4  | **REST transport + dispatcher** — give `@pops/pillar-sdk` a REST transport (root-mounted paths, no `/trpc/`) and generalize the nginx `/<pillar>-api/` rewrite to all pillars (only media has it today).                       | Unblocks every peer↔core REST call.                    |
| C5  | **PRD-245 US-07** — relocate core-owned schemas (`entities`, `aiInferenceLog`) so finance/food stop importing `@pops/core-db`.                                                                                                 | Gates deleting `@pops/core-db`/`-contract` in Phase C. |

C1 + C3 shrink `modules/core` to the platform slice. C2 defines the boundary. C4 is the
shared-mesh unblock. C5 is the tail-cleanup gate.

## Phase 0 — Collapse platform-core into `pillars/core/` (still tRPC), sliced

Scaffold `pillars/core/` (clone the inventory/finance layout: `@pops/core` package,
`src/{db,contract,api}`, generators, `Dockerfile` **port 3001**, extend
`core-quality.yml` to `pillars/core/**`). The registry/heartbeat/SSE/Express routes mount
in `src/api/app.ts` before the ts-rest endpoints. Keep procedure paths identical
(`core.<domain>.*`) for a transparent dispatcher swap. Pillar serves tRPC at `/trpc` until
Phase A. Then, per slice:

0. **db + contract relocate** — `packages/core-db` → `src/db` (carry `openCoreDb` +
   `resolveCoreSqlitePath`), `packages/core-contract` → `src/contract`. **COPY, don't
   delete** the packages (finance/food/inventory/monolith still import them — see Gotcha #6);
   omit the pillar's `./manifest` export until the PRD-245 cleanup slice, or the registry
   double-registers `core`.
1. **registry + service-accounts + users + settings** — fold the four `pops-core-api`
   routers in **with the scaffold** (they're already extracted). Carry the heartbeat/eviction
   tickers, `bootstrapPillar`, `reconcileRegistryOnBoot`, the SSE subscribe + raw-HTTP
   register/heartbeat/deregister. **Move `/pillars/health` + `/uri/resolve` off the monolith**
   into the pillar (fold `uri` into the registry per C3). Collapse the settings duplication.
2. **ai-ops cluster** — `ai-usage`, `ai-budgets`, `ai-providers`, `ai-observability`,
   `ai-alerts` (+ their schedulers wired into `server.ts`, env-gated). **Rewire `ai-alerts`'
   `@pops/cerebrum-db` `nudgeLog` read onto the cerebrum REST SDK** (or drop the dispatcher if
   it follows embeddings to the orchestrator).
3. **entities + envs + features + shell** — small CRUD. `entities` carries the table + CRUD
   only (the finance join left in C1); `envs` keeps its Express shape; `features` keeps its
   `ctx.user` read (identity middleware).

Gotcha: `core-db`/`core-contract` are consumed by both `pops-core-api` AND the monolith
today — moving them in closes core's dep graph; watch for monolith→core import cycles as
handlers leave (same as finance/cerebrum).

## Phase A — Drop tRPC, adopt ts-rest

Finance/inventory recipe: ts-rest contract split per domain
(`src/contract/rest-<domain>.ts` + `rest-schemas.ts` + composer), handler factories over
the moved services, `generateOpenApi` with the zod-4 `schemaTransformer` +
`setOperationId: 'concatenated-path'`, `api-types.generated.ts`, supertest via a
`makeClient` shim. Replace the **opaque `CoreRouter`** with the real ts-rest contract.

Core-specifics:

- **Registry / heartbeat / SSE stay Express**, mounted in the pillar before
  `createExpressEndpoints` (`register`/`heartbeat`/`deregister`/`subscribe`/`/pillars`/
  `/pillars/health`/`/uri/resolve`). These are not ts-rest routes — the contract documents
  their shapes, the wire stays raw HTTP/SSE.
- **Settings cross-pillar surface** (`get/set/ensure/delete/getMany/setMany`) becomes the
  primary REST contract — preserve `getMany`'s `Record<string,string>` / missing-keys-omitted
  semantics and `setMany`'s transactionality (PRD-247).
- **Identity middleware**: validate `x-pops-user` from the dispatcher → `ctx.user`; gate
  `service-accounts` (`userOnly`), `settings` writes, `features`. Leave ai-ops / entities /
  envs on docker-net trust. This replaces `protectedProcedure` / `userOnlyProcedure`.

## Phase B — Generic primitives

Already designed: the **PRD-247 settings surface** (`getMany`/`setMany`) and the
**registry/`uri.resolve`** are core's generic primitives — every consumer is cross-pillar.
Promote both to the REST contract; do not bend them to one consumer.

## Phase C — Infra hygiene

dep-cruiser ban `no-dead-core-pkgs` on `@pops/(core-db|core-contract|core-api|app-ai-db?)`
— **gated on C5 / PRD-245** (finance + food still import `@pops/core-db`); baseline the
remaining known violations until then. Strip dead core `COPY`/`WORKDIR`/build steps from
`apps/pops-api/Dockerfile`; add the **`/core-api` + `/pillars` + `/pillars/health` +
`/uri/resolve`** nginx REST locations (point `/pillars` at the pillar, keep core-api as the
registry authority); switch the published image from `pops-core-api` to `pops-core`; dist
cleanup. Mirror finance #3363; run `lint:boundaries:generate`.

## Phase D — FE rewire + routing

`packages/app-ai` (8 files / ~37 hooks) onto a Hey API client: `openapi-ts.config.ts`,
`src/core-api-runtime-config.ts` (baseUrl `/core-api`), `src/core-api-helpers.ts`
(`unwrap` + status-aware `isNotFoundError` / `isUnavailableError`), regenerate
`src/core-api/`, convert every `usePillarQuery`/`usePillarMutation`/`usePillarUtils('core')`
to react-query + SDK with explicit invalidation (keys `['core', <domain>, <op>, <input?>]`;
mutations invalidate `['core', <domain>]`). Settings-UI consumers that ride the `core` handle
move with it.

Routing: drop `core` from `TRPC_PILLARS` / `split-link` / shell `trpc.ts` / the vite
`^/trpc-(…)` regex; add the `/core-api` → `localhost:3001` dev proxy; **keep `/pillars`,
`/pillars/health`, `/uri/resolve`, `/registry/subscribe` proxied to the pillar**. Add
`pillars/core/openapi/**` to `fe-quality.yml`. Module-registry already discovers collapsed
pillars — but re-check it does not double-register `core` while `core-contract` still exports
`./manifest` (Gotcha #6 / media lesson #2).

## Phase E — Cross-pillar consumers

- **Peers → core (settings/users)**: `pillar('core').{settings,users}.*` from inventory/finance
  crons + the PRD-247 media surface must resolve over the **REST transport** (C4). Verify the
  discovery cache + `PillarCallError` path on the REST wire.
- **Peers re-exporting core tables**: `pillars/finance/src/db/schema.ts` (`entities`,
  `ENTITY_TYPES`), `pillars/food/src/db/schema.ts` (`aiInferenceLog`), inventory's type-only
  `CoreRouter` — repoint via **PRD-245 US-07** so they stop importing `@pops/core-db`/`-contract`.
  Until then, grandfather in the dep-cruiser baseline.
- **Host wiring**: delete the monolith `apps/pops-api/src/modules/core/**` + `routes/pillars.ts`
  - `routes/health.ts` core bits + the `core` handle/backfill in `db/`; remove the in-process
    core schedulers from `apps/pops-api/src/index.ts`. The residual `getDrizzle()`/`getDb()`
    callers and the split-out embeddings job retire with **epic 09 (drop `pops.db`)**.
- **Retire `apps/pops-core-api`** once empty (predecessor shape); drop its compose service +
  GHCR image in favour of `pops-core` from `pillars/core/Dockerfile`.

## Order of PRs

Precursors **C1 (finance reclaim) → C3 (uri→registry) → C2 (orchestrator split) → C4 (REST
transport + dispatcher)** land first (C5/PRD-245 can run in parallel). Then Phase 0 slices
(scaffold + db/contract relocate → registry/settings/service-accounts/users → ai-ops →
entities/envs/features/shell) → Phase A (ts-rest + Express-registry + identity middleware) →
C → D → E. Each PR keeps `core-quality.yml` green; the rest of the lake stays red by design
until consumers migrate. Re-run the
[core outage drill](./core-api-pillar-verification.md) as the final acceptance gate.

## Hard-won gotchas (carried from the finance / media collapses — apply these)

1. **Don't cut nginx to REST before pillar-sdk speaks REST.** Core is on both ends of the
   mesh; a half-cut transport orphans every `pillar('core').*` caller (PRD-247 settings reads,
   the crons) and every registry/uri call out. Land C4 first, verify the discovery cache on the
   REST wire, then cut.
2. **`@pops/core-db`/`-contract` are tail-blocked by PRD-245, not deletable with the pillar.**
   finance/food/inventory import them; deleting them strips the pillar-sdk subgraph and breaks
   every pillar Docker build (media lesson #1). Ban the names only after PRD-245 US-07 repoints
   the peers; keep `./manifest` off the pillar until then to avoid registry double-registration.
3. **The registry must not blink during its own migration.** core-api is the boot-first
   authority; sequence so `/pillars` always answers (the synthetic self-entry +
   `reconcileRegistryOnBoot` cover the window). Don't move `/pillars` + `/pillars/health` +
   `/uri/resolve` off the monolith and retire core-api in the same PR — split the registry
   cutover from the predecessor retirement.
4. **Keep identity for `service-accounts`/`settings`/`features`.** Don't drop auth globally as
   the leaves did — `service-accounts` is the admin CLI/MCP surface (`userOnly`). Use the
   dispatcher-injected `x-pops-user` + pillar middleware (cerebrum pattern).
5. **Collapse the settings duplication.** `settings` lives in both the monolith and core-api
   today — one binding survives; both currently share the same `service.ts` + table, so flip
   callers, don't fork the service.
6. **Process.** `lake-migration` is unprotected → squash-merge; husky pre-push runs repo-wide
   `pnpm typecheck` (red-by-design while the monolith imports removed pkgs) → push
   `--no-verify` after the **scoped** `@pops/core` typecheck passes; after `gh pr merge`,
   `git checkout --` any stray `known-routers.ts` regen, then `git pull --ff-only`.
7. **Drift checks.** `generate:openapi` + `generate:api-types` must be idempotent (CI does
   `git diff --exit-code`); rebuild + re-diff before pushing.
