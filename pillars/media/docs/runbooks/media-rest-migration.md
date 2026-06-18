# Media pillar migration — scattered tRPC → collapsed REST pillar

Goal: bring `media` to the same end state as `finance` (#3344–#3364), `inventory`
(#3336–#3338), and `food` — a collapsed `pillars/media/` (`@pops/media`) that serves
REST from a ts-rest contract, honest OpenAPI, a per-consumer Hey API FE client,
scoped CI (`media-quality.yml`) green, the dead `@pops/media-*` package names
banned, and `apps/pops-media-api` retired.

Follow the generic recipe in [`pillar-rest-migration.md`](../../../../docs/runbooks/pillar-rest-migration.md)
and the worked finance example in [`finance-rest-migration.md`](../../../../docs/runbooks/finance-rest-migration.md);
this doc records only what is **different** for media — and media is the **largest
and most externally-coupled** of the remaining pillars (~5× finance).

## Starting state (today)

Media is split across the same three locations finance was, plus an image byte
route and four external integrations — nothing is in `pillars/media/` yet:

| Where                                      | What                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/media-db` (62 src files)         | schema + services: movies, tv-shows, seasons, episodes, watchlist, watch-history, **comparisons** (+ dimensions / staleness / skip-cooloffs), **media-scores**, **rotation** (candidates / exclusions / log / sources), dismissed-discover, shelf-impressions, **sync-logs / sync-job-results** |
| `packages/media-contract`                  | schemas / types / settings (comparisons, discovery, integrations, operational manifests) + `router.ts` + `./manifest` + hand-curated `openapi/media.openapi.json`                                                                                                                               |
| `apps/pops-media-api/src` (port 3003)      | only `watchlist` + `shelf-impressions` relocated, on tRPC, + app/server/handlers/trpc/manifest scaffold (the `apps/pops-*-api` predecessor shape)                                                                                                                                               |
| `apps/pops-api/src/modules/media/`         | the bulk — ~14 domains still in the monolith (see inventory below)                                                                                                                                                                                                                              |
| `apps/pops-api/src/routes/media/images.ts` | the **`/media/images`** Express byte route (serves `MEDIA_IMAGES_DIR`) — NOT a tRPC procedure                                                                                                                                                                                                   |

**Domain inventory** (monolith `apps/pops-api/src/modules/media/`, ~file counts):

| Domain              | Files | Shape                                                                                            |
| ------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| `movies`            | 5     | CRUD over `media-db` (services in db) — **leaf**                                                 |
| `tv-shows`          | 11    | CRUD (+ seasons/episodes) — **leaf**                                                             |
| `watch-history`     | 11    | CRUD — **leaf**                                                                                  |
| `library`           | 9     | CRUD/listing — **leaf**                                                                          |
| `watchlist`         | 6     | already relocated to `pops-media-api` — **leaf**                                                 |
| `shelf-impressions` | —     | already relocated to `pops-media-api` — **leaf**                                                 |
| `search`            | 7     | cross-cuts movies/tv-shows                                                                       |
| `tmdb`              | 14    | **external**: TMDB metadata client (`TMDB_*`)                                                    |
| `thetvdb`           | 17    | **external**: TheTVDB metadata client (`THETVDB_API_KEY`)                                        |
| `arr`               | 26    | **external**: Radarr/Sonarr clients (`RADARR_*`, `SONARR_*`)                                     |
| `plex`              | 42    | **external + scheduler**: Plex client + in-process sync scheduler (`PLEX_*`, `PLEX_SCHEDULER_*`) |
| `comparisons`       | 51    | **ranking engine** — pairwise comparison + tier-list selection                                   |
| `rotation`          | 36    | **ranking engine** — shelf rotation (candidates/exclusions/sources)                              |
| `discovery`         | 63    | **ranking engine** — context picks / genre spotlight (TMDB + Plex backed); **biggest**           |

- **~215 procedures total** (176 `protectedProcedure` in the monolith module alone +
  the relocated watchlist/shelf-impressions). **~14 domains.**
- **FE**: `packages/app-media` — **151 `usePillar*` hooks across 84 files**, and it
  hits **`/media/images`** directly for poster/art bytes (not via a pillar SDK).
- **Auth**: 176 `protectedProcedure`, **0** `publicProcedure`, **0** identity
  (`ctx.user`) consumers — drops cleanly.
- **External/async** (media's defining wrinkle vs finance):
  - Four external HTTP clients — **Plex**, **Radarr/Sonarr**, **TMDB**, **TheTVDB** —
    all driven by env (`PLEX_URL`/`PLEX_TOKEN`/`PLEX_*_SECTION_ID`, `RADARR_URL`/
    `RADARR_API_KEY`, `SONARR_*`, `TMDB_*`, `THETVDB_API_KEY`).
  - **In-process sync scheduler** (`plex/scheduler.ts` — `startScheduler`/
    `stopScheduler`, gated by `PLEX_SCHEDULER_ENABLED` / `PLEX_SCHEDULER_INTERVAL_MS`),
    with `sync-logs` / `sync-job-results` tables. Scheduler-based (setInterval),
    **not** bullmq — closer to finance's reconcile cron than food's worker.
- **Cross-pillar coupling**: media imports `@pops/core-db` (shared `entities`/`users`
  tables) + `@pops/pillar-sdk`. (The `@pops/finance-db` mentions in `media-db` are
  comments mirroring its error pattern — not real imports.) **`cerebrum`** consumes
  `@pops/media-db` (`semantic-search-metadata`, `thalamus/cross-source`) — the one
  cross-pillar reader, analogous to inventory's read of finance.

## Decisions (confirmed)

- **Target = new `pillars/media/`** (`@pops/media`, port 3003). Consolidate
  `packages/media-db` → `src/db`, `packages/media-contract` → `src/contract`, both
  handler sets (`apps/pops-media-api/src/modules/*` + `apps/pops-api/src/modules/media/*`)
  → `src/api/`, the `/media/images` route → `src/api/`, then **retire
  `apps/pops-media-api`**.
- **Phase 0 sliced by domain, in parallel waves** (below). Media is large enough that
  a single move-PR is unreviewable.
- **External integrations move into the pillar as env-configured HTTP clients** —
  Plex/arr/TMDB/TheTVDB read their base-URLs + API keys from env (the finance
  AI-categorizer env-config pattern, scaled to four clients). No `core/settings`
  dependency for these.
- **Sync schedulers run in the pillar process** (in-process `setInterval`, like
  finance's reconcile cron), auto-started when `PLEX_SCHEDULER_ENABLED=true`, with
  `start`/`stop`/`status` exposed as REST. Sync results land in `sync-logs` /
  `sync-job-results`.
- **`/media/images` stays a non-REST Express byte route** mounted in the pillar
  (serves `MEDIA_IMAGES_DIR`). The FE consumes **two** paths off the media pillar:
  `/media-api` (REST data) and `/media/images` (bytes).
- **Drop all auth** (docker-net trust; dispatcher authenticates) — 0 identity
  consumers, verify per slice.
- **COPY (don't move) `media-db`/`media-contract` during the transition**, and
  **omit the `./manifest` export** from `pillars/media/package.json` until the
  cleanup slice deletes `media-contract` — so `cerebrum`'s `@pops/media-db` read and
  every other pillar bubble stay green, and the module registry doesn't
  double-register `media`. (Both lessons from the finance collapse — see Gotchas.)

## Phase 0 — Collapse handlers into the pillar (still tRPC), sliced by domain

Scaffold `pillars/media/` (clone the inventory/finance layout: `src/{db,contract,api}`,
generators, `Dockerfile` port 3003, `media-quality.yml`). Then move per domain,
keeping `media.<domain>.*` paths identical for a transparent cutover. **Parallel
waves** (within a wave, slices touch disjoint files → parallelizable; cross-wave is
ordered by dependency):

- **Wave 1 — leaf CRUD (fully parallel).** `movies`, `tv-shows` (+ seasons/episodes),
  `watch-history`, `library`. (`watchlist` + `shelf-impressions` are already in
  `pops-media-api` — fold them in with the scaffold.) Plain db-arg services, no
  external coupling — the clean, finance-wishlist-style slices.
- **Wave 2 — external-integration clients (parallel; one slice each).** `tmdb`,
  `thetvdb`, `arr`, `plex`. Each carries its env-configured HTTP client + the
  `sync-logs`/`sync-job-results` writes it owns; `plex` additionally carries the
  scheduler (wire `startScheduler` into the pillar server, gated by env).
- **Wave 3 — ranking engine (sequential; interdependent).** `comparisons` →
  `rotation` → `discovery` (they read movies/tv-shows + `media-scores` + the Wave-2
  metadata/Plex data). `search` last (cross-cuts movies/tv-shows). The gnarliest,
  largest slices — do after Waves 1–2 land.
- **Infra alongside Wave 1**: mount the `/media/images` byte route in the pillar app;
  wire the sync scheduler into `server.ts` with env-gated auto-start + `stop()` on
  shutdown.

Gotcha: `media-db` is consumed by `pops-media-api` AND the monolith today — moving
it in closes media's dep graph; watch for monolith→media import cycles as handlers
leave (same as finance/food).

## Phase A — Drop tRPC, adopt ts-rest

Inventory/finance recipe: ts-rest contract split per domain
(`src/contract/rest-<domain>.ts` + `rest-schemas.ts` + composer), handler factories
over the moved services, `generateOpenApi` with the zod-4 `schemaTransformer` +
`setOperationId: 'concatenated-path'`, `api-types.generated.ts`, drop auth,
supertest tests via a `makeClient` shim.

Media-specifics:

- **`hoistDefinitions` will be needed** — the `comparisons`/`rotation`/`discovery`
  graphs (tier lists, pair trees, ranking nodes) are recursive `z.lazy` schema
  candidates (cf. inventory's location tree). Give them stable `.meta({ id })` names.
- **External calls stay synchronous request/response REST** (TMDB/TheTVDB/arr/Plex
  lookups — accept the latency); **long syncs are scheduler-triggered + status-polled**,
  not per-request: `POST /plex/scheduler/start|stop`, `GET /plex/scheduler/status`,
  `GET /sync/:id` (results from `sync-job-results`).
- **`/media/images` is NOT a contract route** — mount the Express byte router
  alongside `createExpressEndpoints` in `app.ts` (serves `MEDIA_IMAGES_DIR`).
- Author REST schemas from the **actual `to<Entity>` mappers**, not the idealized
  `media-contract/schemas/` (those are the pre-migration "honest-OpenAPI-nobody-serves"
  shapes — see Gotchas).

## Phase B — Generic primitives

The `cerebrum` media read (`semantic-search-metadata`, `thalamus/cross-source`) is
the candidate. Give it a **generic media search/lookup primitive** (movies + tv-shows
by id / title / external-id) rather than a cerebrum-shaped route — the pillar cannot
bend to one consumer's logic. Skip otherwise.

## Phase C — Infra hygiene

dep-cruiser ban `no-dead-media-pkgs` on
`@pops/(app-media-db|media-db|media-contract|media-api)`; baseline the remaining known
violations; strip dead media `COPY`/`WORKDIR`/build steps from `apps/pops-api/Dockerfile`
and relocate the `/media/images` route; dist cleanup. Mirror finance #3363 — and run
`lint:boundaries:generate` so the generated cross-pillar rule for media is dropped
(see Gotchas #1).

## Phase D — FE rewire + routing

`packages/app-media` (151 hooks / 84 files) onto a Hey API client:
`openapi-ts.config.ts`, `src/media-api-runtime-config.ts` (baseUrl `/media-api`),
`src/media-api-helpers.ts` (`unwrap` + status-aware `isNotFoundError` /
`isUnavailableError`), regenerate `src/media-api/`, convert every
`usePillarQuery`/`usePillarMutation`/`usePillarUtils` to react-query + SDK with
explicit invalidation (keys `['media', <domain>, <op>, <input?>]`; mutations
invalidate `['media', <domain>]`). **Fan the rewire out by feature area** (shelves,
comparisons, discovery, detail pages, search) with the strict key convention, then
verify centrally with `tsc` + tests.

Routing: drop `media` from `TRPC_PILLARS` / `split-link` / shell `trpc.ts` / the vite
`^/trpc-(…)` regex; add the `/media-api` → `localhost:3003` dev proxy; **keep the
`/media/images` proxy pointed at the media pillar** (dev vite + prod nginx); add
`pillars/media/openapi/**` to `fe-quality.yml`. Module-registry already discovers
collapsed pillars — no change.

## Phase E — Cross-pillar consumers

- **`cerebrum`** (`semantic-search-metadata`, `thalamus/cross-source`) imports
  `@pops/media-db` → rewire onto the Phase B media search primitive (openapi-fetch /
  Hey API), **or** resolve when cerebrum itself collapses (PRDs 179–182) — whichever
  lands first. Until then it's grandfathered in the dep-cruiser baseline.
- `apps/pops-api/src/db/{backfill-media-from-shared,media-db-handle}.ts` + the
  monolith media module → red-by-design until pops-api's media module is deleted
  (PRD-254 `us-05-media`).

## Order of PRs

Scaffold + db/contract relocate → Wave 1 (parallel) → Wave 2 (parallel) → Wave 3
(sequential) → Phase A (per domain, parallel) → C → D → E. Each PR keeps
`media-quality.yml` green; the rest of the lake stays red by design until consumers
migrate.

## Hard-won gotchas (carried from the finance collapse — apply these)

1. **Tail-slice blast radius.** Deleting `media-contract` drops it from the
   **pillar-sdk subgraph**, so every pillar Docker image that `COPY`s it
   (finance/food/lists/inventory/media) fails to build. When you delete it: strip the
   `COPY packages/media-contract/...` lines from **every** `pillars/*/Dockerfile`, and
   run `pnpm lint:boundaries:generate` so the generated `no-cross-pillar-runtime-import-media`
   rule is dropped — otherwise `Module boundaries` + all pillar Docker builds go red.
2. **module-registry double-registration.** `media-contract` has a `./manifest`
   export. If `pillars/media` ALSO exports `./manifest` while `media-contract` still
   exists, the registry walk discovers `media` twice. Omit `./manifest` on the pillar
   during the COPY window; add it + regen `generated.ts` only in the cleanup slice
   that deletes `media-contract`.
3. **Lint caps.** Per-file `max-lines` 200, `max-params` 4, `max-depth` 3; the root
   `.oxlintrc` only relaxes `*-handlers.ts` + `*.generated.ts`. Split files / use
   args-objects — never suppress (no `eslint-disable`/`as any`/`as unknown as`).
4. **Honest schemas.** `media-contract/schemas/{movie,tv-show,…}` are idealized
   pre-migration shapes that don't match the wire — author the REST schemas from the
   real `to<Entity>` mappers so the OpenAPI projection is honest.
5. **operationIds are dotted** (`movies.list`) → Hey API camelCases them
   (`moviesList`); the SDK fn names follow the contract keys, not the paths.
6. **Drift checks.** `generate:openapi` + `generate:api-types` must be idempotent
   (CI does `git diff --exit-code`). Rebuild + re-diff before pushing.
7. **Process.** `lake-migration` is unprotected → squash-merge feature branches. The
   husky **pre-push hook runs repo-wide `pnpm typecheck`**, which is red-by-design
   (the monolith imports removed pkgs) → push with `--no-verify` after the _scoped_
   `@pops/media` typecheck passes in isolation. After `gh pr merge`, expect a stray
   `apps/pops-api/src/generated/known-routers.ts` regeneration — `git checkout --` it,
   then `git pull --ff-only`.
8. **Concurrent-work conflicts.** The dep-cruiser baseline, `pnpm-lock.yaml`, and the
   shared routing files (`known-pillar-id.ts`, `split-link.ts`, shell `trpc.ts`, vite
   config, `fe-quality.yml`) are edited by other in-flight pillar work — keep diffs
   minimal/orthogonal, and when the baseline conflicts, rebase onto the latest
   `lake-migration` and **regenerate** it (don't hand-merge).
9. **FE lands red-by-design.** The whole-FE `fe-quality` bubble stays red (app-media
   still imports `@pops/api` types for any residual core-served calls, and the
   monolith is broken). Verify **app-media in isolation** — its own test suite +
   `pillar-sdk`/`api-client`/`pops-shell` source typechecks — not green `fe-quality`.
10. **Deploy plumbing is not auto-updated.** `infra/docker-compose.*` (the `media-api`
    service still builds `apps/pops-media-api/Dockerfile`), `nginx.conf` /
    `generate-nginx-conf.ts` (media still a `/trpc-media` upstream), and the
    `pops-media-api` published image are a separate deploy-cutover step — shared debt
    across all collapsed pillars. Do `/media-api` + **`/media/images`** nginx
    locations, point compose at `pillars/media/Dockerfile`, and switch the image to
    `pops-media`.
11. **Don't forget `/media/images`.** It's the one route NOT in the ts-rest contract;
    the FE depends on it for bytes. The pillar must serve it (Express static/proxy
    over `MEDIA_IMAGES_DIR`) and dev vite + prod nginx must route it to the pillar.
