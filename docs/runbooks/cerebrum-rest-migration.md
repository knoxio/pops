# Cerebrum pillar migration — tRPC-in-pops-api → collapsed REST pillar

Goal: bring `cerebrum` (the memory / retrieval / autonomous-agent pillar, incl. the
`ego` conversational surface) to the same end state as `lists`, `inventory`,
`finance`, and `food` — a collapsed `pillars/cerebrum/` that serves REST from a
ts-rest contract, with an honest OpenAPI projection, per-consumer Hey API FE
clients, scoped CI (`cerebrum-quality.yml`) green, and the dead `@pops/cerebrum-*`
package names banned.

Follow the generic recipe in [`pillar-rest-migration.md`](./pillar-rest-migration.md);
this doc records only what is **different** for cerebrum. Cerebrum is the **largest
and hardest** of the remaining pillars: ~94 procedures over 13 domains, an LLM/
embeddings/vector-search core, SSE streaming, identity-dependent handlers, and
two-way cross-pillar coupling. Treat food as the worked reference and read the
cerebrum-specific risks below before slicing.

## Starting state (today)

Cerebrum is in a **scattered, partially-extracted** state — like finance, it
already has a predecessor `apps/pops-cerebrum-api`, but no `pillars/cerebrum/` yet.

| Where                                       | What                                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cerebrum-db`                      | ✅ schema + services (engrams, conversations, nudges, glia, plexus, reflex, debrief, embeddings)                                               |
| `packages/cerebrum-contract`               | ✅ settings manifests (`cerebrumManifest`, `egoManifest`) + zod schemas/types; `./router` is still an **opaque `AnyTRPCRouter`** (PRD-155)     |
| `apps/pops-cerebrum-api/src/modules/`       | partial: only `nudges`, `embeddings`, `debrief` flipped to the `cerebrum.db` handle (Phase-5 minimal dispatcher)                              |
| `apps/pops-api/src/modules/cerebrum/**`     | ❌ the rest — ~94 procs across 13 domains, ~28k LOC, 11 routers + ~41 support files                                                            |
| `apps/pops-api/src/routes/{cerebrum,ego}/`  | ❌ **two SSE Express routes**: `cerebrum/query-stream.ts`, `ego/chat-stream.ts`                                                                |
| `pillars/cerebrum/`                          | ❌ does not exist                                                                                                                              |

Surface to move/migrate:

- **~94 tRPC procedures** across 13 domains: `engrams` (+ scopes/tags/links, ~15),
  `glia` (9), `ingest` (8), `nudges` (7), `plexus` (7), `ego` (7), `workers` (7),
  `reflex` (6), `emit` (5), `retrieval` (4), `thalamus` (4), `query` (3),
  `templates` (2).
- **2 SSE Express routes**: `POST /api/ego/chat/stream`, `POST /api/cerebrum/query/stream`.
- **FE**: `packages/app-cerebrum` — ~87 `usePillar*` hooks across ~27 files; plus
  `packages/overlay-ego` (the ego chat overlay — SSE/chat hooks, mounted via the FE
  manifest; routes through the shell rather than calling tRPC directly).
- Auth: **all `protectedProcedure`** (~94), ~3 `internalProcedure` (glia/consolidation).
  Several handlers **consume `ctx.user`** — `ego.chat`, `retrieval.*`, `query.*`,
  `ingest.*` (scope negotiation + conversation/source attribution).

**Phase-1 already done** (~95%): a dedicated `cerebrum.db` handle
(`apps/pops-api/src/db/cerebrum-handle.ts`, `getCerebrumDrizzle()`), a boot-time
ATTACH backfill (`backfill-cerebrum-from-shared.ts`), the migration-journal split
(0039/0044), and `nudge_log` writes flipped. **Not yet owned by `cerebrum.db`:**
`nudge_log` reads in some paths, and the `embeddings_vec` (sqlite-vec) **vector
blobs** still live on the shared `pops.db` (the backfill copies embedding metadata
only). These are Phase-1/Phase-E loose ends to close during this migration.

## What makes cerebrum different (read before slicing)

1. **LLM + embeddings core.** Anthropic calls in `ego` (chat), `query`, `ingest`
   (classifier / entity-extractor / scope-inference), `emit`, and the
   `workers/llm-contradiction-detector`. Embedding generation is enqueued on engram
   write (`thalamus/embedding-trigger.ts`) via the shared `embedding-client`.
2. **Vector search (sqlite-vec).** `retrieval/semantic-search.ts` runs `knnQuery()`
   against the `embeddings_vec` virtual table. The extension is loaded on-demand in
   `openCerebrumDb()`; the pillar's db-open path **must** load it or semantic search
   fails silently. The vector blobs are still on shared `pops.db` (see above) —
   ownership must move to `cerebrum.db` (rebuild the index on cutover) before the
   shared handle can be retired.
3. **SSE streaming.** Two endpoints stream (`ego.chat`, `cerebrum.query`). ts-rest
   does not model SSE — keep these as **plain Express routes mounted in the pillar**
   (the food hero-image / ingest-media precedent: register before
   `createExpressEndpoints`). The non-streaming variants stay normal REST.
4. **Identity-dependent handlers.** Unlike food/lists/inventory, cerebrum **cannot
   drop auth globally**. `ego.*`, `retrieval.*`, `query.*`, `ingest.*` need the
   acting user (scope filtering, conversation/source attribution). The dispatcher
   must authenticate and propagate identity into the pillar (header-injected user,
   validated by a pillar middleware) — design this in Phase A, don't hand-wave it.
5. **`ego` is dual-routed.** Today `ego` is both a top-level tRPC router
   (`known-routers.ts: ego: egoRouter`) and reachable as `cerebrum.ego.*`, with its
   own `egoManifest` (app + overlay surfaces). Decision below.
6. **Two-way cross-pillar coupling.** Cerebrum **reads peers' DBs directly** for
   retrieval enrichment — `retrieval/semantic-search-metadata.ts` and
   `thalamus/cross-source.ts` import `@pops/inventory-db` / `@pops/media-db` and join
   `engram_index` against `home_inventory` / `movies` / `tv_shows` / `transactions`.
   This must become **REST reads via peer SDKs**. Cerebrum is also **consumed by**
   `app-media` (debrief), `app-cerebrum`, and `overlay-ego`.
7. **Stateful, closed-loop domains.** `ego` conversations are append-only and
   transactional; `glia` + `reflex` form an autonomous propose→trust→execute loop
   (some worker-driven). Preserve transaction boundaries and the job pipeline across
   the extraction — don't break the loop mid-slice.

## Decisions (confirmed)

- **Target = new `pillars/cerebrum/`** (the `@pops/cerebrum` package: `src/{db,
  contract,api,worker?}`, health/`pillars` probes, manifest, Dockerfile,
  `cerebrum-quality.yml`). Consolidate `packages/cerebrum-db` → `src/db`,
  `packages/cerebrum-contract` → `src/contract`, **both** handler sets
  (`apps/pops-cerebrum-api/src/modules/*` + `apps/pops-api/src/modules/cerebrum/*`)
  → `src/api/`, then **retire `apps/pops-cerebrum-api`** (the predecessor shape, as
  finance did).
- **`ego` stays inside the cerebrum pillar — one process, one db, one contract.**
  Do not split it into a separate pillar (it shares conversations/engrams/retrieval
  and would create circular routing). Preserve its wire identity as a distinct
  **contract surface** within the pillar: serve `ego.*` paths (and keep the
  `egoManifest` app+overlay dimensions) from the same container. The FE keeps
  calling an `ego` client; it just points at the cerebrum pillar.
- **SSE routes stay Express, mounted in the pillar** (`/ego/chat/stream`,
  `/cerebrum/query/stream`), registered before the ts-rest endpoints. Non-streaming
  AI calls are request/response REST (accept the latency; no queueing the user-facing
  LLM call).
- **Auth is NOT dropped.** Keep identity for `ego`/`retrieval`/`query`/`ingest`. The
  dispatcher authenticates and forwards the user (e.g. a signed `x-pops-user`
  header); a pillar middleware reconstructs `ctx.user`. Non-identity domains
  (`templates`, `thalamus`, `plexus`, parts of `reflex`/`nudges`) can trust the
  docker net. Decide per slice.
- **Embeddings/vector stay in the pillar.** The pillar's `openCerebrumDb()` loads
  sqlite-vec; move the `embeddings_vec` blob ownership to `cerebrum.db` and rebuild
  the kNN index on cutover. Embedding generation stays enqueued + non-blocking; the
  graceful-degradation path (no vectors → no semantic results) is preserved.
- **Cross-pillar reads rewired onto peer REST SDKs** (inventory/media/finance) in the
  slice that owns retrieval/thalamus — removes the direct `@pops/*-db` imports
  (mirrors food's send-to-list). Accept that enrichment becomes N REST reads.
- **Phase 0 sliced by domain** — one move-PR per domain group; leaf-first.

## Phase 0 — Collapse into `pillars/cerebrum/` (still tRPC), sliced by domain

Scaffold `pillars/cerebrum/` (clone the inventory/food pillar layout: `@pops/cerebrum`
package, `src/{db,contract,api}`, health/`pillars`, manifest, Dockerfile,
`cerebrum-quality.yml`, port **3007**). Then, per slice, move
`apps/pops-api/src/modules/cerebrum/<domain>/**` (+ the `pops-cerebrum-api` half for
the already-split domains, + the matching `routes/` for SSE) into
`pillars/cerebrum/src/api/<domain>/`, carrying its `services`/`inputs`/`types`. Keep
procedure paths identical (`cerebrum.<domain>.*`, `ego.*`) so the dispatcher cutover
is a transparent URL swap. Pillar serves tRPC at `/trpc` until Phase A.

0. **db + contract relocate** — `packages/cerebrum-db` → `src/db` (carry the
   sqlite-vec load in `openCerebrumDb`), `packages/cerebrum-contract` → `src/contract`.
   Fold the `cerebrum-handle` + backfill host-wiring decision in here (it moves to the
   pillar's own db bootstrap). Keep the `@pops/cerebrum` exports (`.`, `./manifest`,
   later `./openapi`, `./api-types`, `./queue` if a worker contract is needed).
1. **Leaf / utility:** `templates` (2), `thalamus` (4), `plexus` (7). No cross-pillar
   reads, no identity, no streaming.
2. **`reflex` (6) + `glia` (9)** — execution log + trigger rules + trust state.
   Keep the worker/job pipeline intact; move any BullMQ producer into the pillar.
3. **`nudges` (7)** — pair with the already-split `nudges`/`embeddings`/`debrief` in
   `pops-cerebrum-api`; finish flipping `nudge_log` ownership to `cerebrum.db` here.
4. **`engrams` (+ scopes/tags/links, ~15)** — core memory CRUD + graph edges. Large
   but self-contained (the cross-pillar joins live in retrieval, not here).
5. **`retrieval` (4)** — semantic search + context + similar + stats. **Owns the
   cross-pillar rewire**: replace the direct `@pops/inventory-db`/`@pops/media-db`
   joins with REST reads via peer SDKs. Resolve the `embeddings_vec` ownership move
   here. Identity-dependent.
6. **`emit` (5) + `query` (3, + `/cerebrum/query/stream` SSE)** — rule eval + NL Q&A.
   Depends on retrieval; identity-dependent; SSE route mounts in the pillar.
7. **`ingest` (8)** — engram/scope/entity inference (Anthropic calls). Identity +
   async; keep classifiers' request context.
8. **`ego` (7, + `/ego/chat/stream` SSE) + `workers` (7)** — chat engine +
   conversations + autonomous workers. **Last and largest:** strongest identity
   dependency, SSE, stateful conversations, dual-surface manifest. Move the worker
   consolidation/contradiction pipeline with it.

Gotcha: `cerebrum-db`/`-contract` are consumed by both `apps/pops-cerebrum-api` AND
the monolith today — moving them in closes cerebrum's dep graph; watch for
monolith→cerebrum import cycles as handlers leave (same as food/finance). Also watch
the retrieval **stale-data window**: post-move, engrams write to `cerebrum.db` but
enrichment reads still hit shared `pops.db` until the slice-5 rewire lands.

## Phase A — Drop tRPC, adopt ts-rest

Inventory #3336 recipe: ts-rest contract split per domain
(`src/contract/rest-<domain>.ts` + `rest-schemas.ts` + composer), handler factories
over the moved services, `generateOpenApi` with the zod-4 `schemaTransformer` +
`setOperationId: 'concatenated-path'` (+ `hoistDefinitions` for any recursive schemas
— the engram **graph** / links is a candidate), `api-types.generated.ts`, supertest
tests via a `makeClient` shim.

Cerebrum-specifics:

- **SSE** (`ego.chat`, `cerebrum.query`): keep as Express handlers mounted in
  `app.ts` before `createExpressEndpoints`; they are NOT ts-rest routes. The contract
  documents the non-streaming siblings; the FE picks the stream endpoint directly.
- **AI request/response** (ingest inference, emit eval, non-streaming chat/query):
  normal `POST` routes; large bodies — set the JSON body limit (cf. food's `20mb`).
- **Identity**: add the pillar auth middleware (validate `x-pops-user` from the
  dispatcher → `ctx.user`); gate the identity domains, leave the rest on docker-net
  trust. This replaces tRPC's `protectedProcedure`.
- **Embeddings/retrieval**: the contract exposes `retrieval.search/context/similar/
  stats`; the kNN + enrichment run server-side. Keep the no-vectors degradation path.

## Phase B — Generic primitives

Likely skip (as inventory/food/finance did). The candidate is the **cross-pillar
enrichment read** the *other* direction — but that's cerebrum *consuming* peers via
their SDKs, not exposing a generic. If a consumer needs a generic cerebrum primitive
(e.g. a generic `retrieval` or `engram-search` for another pillar), add it then.

## Phase C — Infra hygiene

dep-cruiser ban `no-dead-cerebrum-pkgs` on
`@pops/(cerebrum-db|cerebrum-contract|cerebrum-api)`; baseline the remaining known
violations; strip dead cerebrum `COPY`/`WORKDIR`/build steps from
`apps/pops-api/Dockerfile` (and `apps/pops-shell/Dockerfile`); retire the
`apps/pops-cerebrum-api` Docker/compose entries once it's empty. Mirror inventory
#3337. (Note: the cross-cutting `known-routers` regen + nginx-generator REST-awareness
are shared with food/lists/inventory — fold into the batched infra pass.)

## Phase D — FE rewire + routing

`packages/app-cerebrum` (~87 hooks / ~27 files) onto a Hey API client:
`openapi-ts.config.ts`, `src/cerebrum-api-runtime-config.ts` (baseUrl `/cerebrum-api`),
`src/cerebrum-api-helpers.ts` (`unwrap` + status-aware `isNotFoundError` /
`isUnavailableError`), regenerate `src/cerebrum-api/`, convert every `usePillarQuery`/
`usePillarMutation`/`usePillarUtils` to react-query + SDK with explicit invalidation
(keys `['cerebrum', <module>, <op>, <input?>]`; mutations invalidate
`['cerebrum', <module>]`).

Cerebrum-specifics:

- **`overlay-ego`**: rewire its chat/conversation hooks onto an `ego` client (the
  cerebrum pillar serves `ego.*`). The **streaming** chat hook talks to the SSE
  endpoint directly (`fetch` + `ReadableStream`/`EventSource`), not the generated SDK
  — keep that path; only the non-streaming conversation CRUD moves to the SDK.
- **Routing**: drop `cerebrum` (and `ego`) from `TRPC_PILLARS` / shell
  `PILLAR_TRPC_URLS` / the vite `^/trpc-(...)` regex; add the `/cerebrum-api` dev
  proxy (→3007) and ensure the SSE paths proxy too; add `pillars/cerebrum/openapi/**`
  to `fe-quality.yml`. Module-registry already discovers collapsed pillars.

## Phase E — Cross-pillar consumers

- **Cerebrum→peers** (retrieval/thalamus direct-db reads of inventory/media/finance):
  rewired in Phase 0 slice 5 onto peer REST SDKs — verify none remain.
- **Peers→cerebrum**: `app-media` debrief consumer + any `usePillar('cerebrum'|'ego')`
  / `inferRouter*<AppRouter>['cerebrum'|'ego']` elsewhere → repoint onto the cerebrum
  SDK (like food's send-to-list lists read).
- **Host wiring**: `apps/pops-api/src/db/{cerebrum-handle,backfill-cerebrum-from-shared}.ts`
  + the `index.ts`/`db.ts` boot calls — remove when the monolith cerebrum module is
  gone (food Phase-E precedent). Finish the **`embeddings_vec` + `nudge_log`**
  ownership move to `cerebrum.db` so the shared backfill can retire.
- Delete the monolith `apps/pops-api/src/modules/cerebrum/**` + `routes/{cerebrum,ego}`
  + the `known-routers` `cerebrum`/`ego` entries.

## Order of PRs

Phase 0 slices (scaffold + db/contract relocate → per-domain handler moves leaf-first,
with the cross-pillar + `embeddings_vec`/`nudge_log` rewires in their owning slices,
`ego` last) → Phase A (ts-rest + SSE-as-Express + identity middleware) → C → D → E.
Each PR keeps `cerebrum-quality.yml` green; the rest of the lake stays red by design
until consumers migrate.
