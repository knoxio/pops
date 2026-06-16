# Food pillar migration — tRPC-in-pops-api → collapsed REST pillar

Goal: bring `food` to the same end state as `lists` (#3332–#3335) and `inventory`
(#3336–#3337) — a collapsed pillar that serves REST from a ts-rest contract,
with an honest OpenAPI projection, a per-consumer Hey API FE client, scoped CI
(`food-quality.yml`) green, and the dead `@pops/food-*` package names banned.

Follow the generic recipe in [`pillar-rest-migration.md`](./pillar-rest-migration.md);
this doc records only what is **different** for food.

## Starting state (today)

Food is in a **split** state — further back than lists/inventory were when their
REST work began:

| Layer | in pillar? |
| --- | --- |
| `pillars/food/src/db` (schema, services) | ✅ |
| `pillars/food/src/worker` (bullmq ingest: AI parse, web/instagram scrape, screenshots, prompts) | ✅ |
| `pillars/food/src/{domain,dsl,inbox,seed}` | ✅ |
| **API handlers** | ❌ still in `apps/pops-api/src/modules/food/**` + `apps/pops-api/src/routes/food/**` |
| `pillars/food/src/api/` | only `/health` + `/pillars` scaffold; `contract/router.ts` exports `unknown` |

Surface to move/migrate:

- **~97 tRPC procedures** across ~15 domains: `recipes` (+ `send-to-list` subtree),
  `plan`, `shopping`, `cook`, `fridge`, `solver`, `inbox`, ingest
  (`routers/ingest-*`, `services/ingest-*`), `ingredients`, `substitutions`,
  `variants`, `aliases`, `ingredient-tags`, `prep-states`, `slugs`, `hero-image`,
  `conversions`, `batches`, `ai`. (~2× inventory.)
- **Express routes** in `apps/pops-api/src/routes/food/`: `ingest-files.ts` (file
  upload), `recipes.ts` (rendering).
- **FE**: `packages/app-food` — **326 `usePillar*` hooks across 97 files** (~6.5×
  inventory).
- Auth: 108 `protectedProcedure` / 6 `publicProcedure`.

Two things lists/inventory did not have:

1. **Async worker pipeline** (bullmq/redis). Recipe ingest is already job-shaped:
   API enqueues, the in-pillar worker processes, the FE polls status. This stays.
   REST exposes enqueue / status / cancel — the worker is untouched.
2. **`send-to-list` writes directly into the lists DB**
   (`import { ListsDb } from '@pops/app-lists-db'; listsDb.transaction(...)`). That
   is the dead lists pkg and **is lists' deferred Phase E**. lists PR #3333 added
   the `upsert-by-ref` primitive specifically so food can do this over REST.

## Decisions (confirmed)

- **Phase 0 sliced by domain** — one move-PR per domain group, not a single
  mega-move. Reviewable, lower conflict surface.
- **`send-to-list` rewired onto the lists REST API** (`upsert-by-ref`) as part of
  food's migration. Removes the cross-pillar DB write and **closes lists Phase E**.
- **Jobs stay async; synchronous AI endpoints stay request/response REST.** Ingest
  = enqueue + poll-status + cancel (worker unchanged). AI parse calls remain
  request/response (accept longer latencies) rather than moving onto the queue.
- **File uploads stay base64-in-JSON** (parity with inventory). Not multipart.
- **Drop all auth** (docker-net trust; dispatcher authenticates) — consistent with
  lists/inventory, assuming food handlers consume no identity (verify per slice).

## Phase 0 — Collapse handlers into the pillar (still tRPC), sliced by domain

The inventory `#3331` equivalent, but ~2× and split into slices. For each domain
group, move `apps/pops-api/src/modules/food/<domain>/**` (and the matching
`routes/food` bits) into `pillars/food/src/api/<domain>/`, carrying the local
`services`/`inputs`/`types` it uses. Keep procedure paths identical
(`food.<domain>.*`) so the dispatcher cutover stays a transparent URL swap. Pillar
serves tRPC at `/trpc` (as inventory did post-#3331) until Phase A.

Suggested slice order (leaf-first, defer the cross-cutting ones):

1. Leaf CRUD: `ingredients`, `ingredient-tags`, `aliases`, `prep-states`, `slugs`,
   `variants`, `conversions`, `hero-image`.
2. `substitutions` (+ `services/substitutions-resolve*`), `solver`.
3. `batches`, `fridge`, `inbox`.
4. `recipes` (large) — including the **`send-to-list` rewire onto lists REST**
   (drop `@pops/app-lists-db`; call the lists pillar via its openapi-fetch/Hey API
   client). This slice closes lists Phase E.
5. `plan`, `shopping` (depends on recipes + send-to-list).
6. `ingest` (`routers/ingest-*`, `services/ingest-*`, `routes/food/ingest-files.ts`)
   + `ai`. Enqueue/status/cancel; keep the worker contract in
   `pillars/food/src/contract/queue` intact.

Gotcha: food's db/worker already import each other inside the pillar — moving the
API in means the pillar's dep graph closes; watch for `apps/pops-api` → food
import cycles breaking as handlers leave.

## Phase A — Drop tRPC, adopt ts-rest

Same recipe as inventory #3336: ts-rest contract split per domain
(`src/contract/rest-<domain>.ts` + `rest-schemas.ts` + composer), handler
factories over the moved services, `generateOpenApi` with the zod-4
`schemaTransformer` + `setOperationId: 'concatenated-path'` (+ the
`hoistDefinitions` pass if any recursive `z.lazy` schemas appear — substitutions
graph is a candidate), `@hey-api`-free `api-types.generated.ts`, drop auth,
supertest tests via a `makeClient` shim.

Async surface in the contract:
- `POST /recipes/ingest` (or per existing path) → enqueue, returns job id.
- `GET /ingest/:id` → status. `POST /ingest/:id/cancel` → cancel.
- File upload (`ingest-files`) → base64 body field, decoded in the handler.

## Phase B — Generic primitives

Likely skip (as inventory did). Add only if a cross-pillar consumer needs a
generic food endpoint — see Phase E consumers first.

## Phase C — Infra hygiene

dep-cruiser ban `no-dead-food-pkgs` on
`@pops/(app-food-db|food-db|food-contract|food-contracts|food-api)`; baseline the
remaining known violations; strip dead food `COPY`/`WORKDIR`/build steps from
`apps/pops-api/Dockerfile`; dist cleanup. Mirror inventory #3337.

## Phase D — FE rewire + routing

`packages/app-food` (326 hooks / 97 files — the largest FE rewire) onto a Hey API
client: `openapi-ts.config.ts`, `src/food-api-runtime-config.ts` (baseUrl
`/food-api`), `src/food-api-helpers.ts` (`unwrap` + `isNotFoundError` /
`isUnavailableError`), regenerate `src/food-api/`, convert every `usePillarQuery`/
`usePillarMutation`/`usePillarUtils` to react-query + SDK with explicit
invalidation. Routing: drop `food` from `TRPC_PILLARS` / split-link / shell trpc /
vite regex; add `/food-api` (API) proxy (+ worker port if the FE hits it);
module-registry regen; add `pillars/food/openapi/**` to `fe-quality.yml`.

Given the size, fan the call-site rewire out by page/feature area with the strict
query-key convention (`['food', <module>, <op>, <input?>]`; mutations invalidate
`['food', <module>]`), then verify centrally with `tsc` + tests + `fe-quality`.

## Phase E — Cross-pillar consumers

- `packages/app-lists/src/index.ts` imports `@pops/food-db` — repoint or remove.
- `apps/pops-api/src/db/{backfill-food-from-shared,food-handle}.ts` reference the
  food db — these are the host wiring; resolve when pops-api's food module is gone.
- `send-to-list` is handled in Phase 0 slice 4 (not deferred).

## Order of PRs

Phase 0 slices (1→6, each its own PR) → Phase A (per domain or grouped) → C → D →
E. Each PR keeps `food-quality.yml` green; the rest of the lake stays red by
design until consumers migrate.
