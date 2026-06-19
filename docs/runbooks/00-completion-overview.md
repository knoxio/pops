# Lake migration — completion plan (overview & sequencing)

The leaf migration is done. This plan covers **only the work that remains** to reach
the end state. The worked per-pillar `*-rest-migration.md` runbooks and their
verification drills now live in each pillar's own `pillars/<x>/docs/runbooks/` (migrated
upstream, #3436–#3442) and are superseded by this plan; the few non-pillar ops runbooks
that stayed central are kept here as `DEPRECATED_*.md` for history.

## The goal (end state)

A finished lake has **no monolith and no shared anything**. Concretely:

1. **No monolith.** `apps/pops-api` and the `apps/pops-core-api` predecessor are deleted.
   No `apps/pops-*-api` service remains (the one open question is `pops-ha-bridge-api` —
   see below).
2. **Seven clean pillars.** Each `pillars/<x>/` owns its DB (`src/db`, its own sqlite),
   serves a **ts-rest** contract (`src/contract`) built from **zod** schemas, projects an
   **honest OpenAPI** doc (`openapi/<x>.openapi.json`, generated, idempotent), generates
   `api-types.generated.ts`, and exports a **manifest** (`./manifest`). No pillar serves
   `/trpc`. No pillar depends on `@trpc/*`.
3. **All consumers on the API.** The FE consumes pillars exclusively through generated
   **Hey API** clients; cross-pillar reads go over the **REST** `pillar()` SDK. No direct
   cross-pillar DB imports.
4. **tRPC nowhere.** No tRPC servers, no browser tRPC client, no `usePillar*` hooks, no
   `/trpc` routes, no `@trpc/*` dependencies (including type-only `AnyTRPCRouter` shims).
5. **No shared DB / no shared API.** No `pops.db`, no `getDrizzle()/getDb()`, no
   `backfill-*-from-shared` / `*-handle` scaffolding, no shared `@pops/api` router types.

## Global verification (the final acceptance gate)

The migration is done when **all** of these pass from a clean checkout of `main`:

| #   | Check                           | Command / signal                                                                                                                                                                                                              |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | No tRPC anywhere in source      | `rg -n -e '@trpc/' -e 'initTRPC' -e 'createTRPCRouter' -e 'Procedure\b' -e 'createTRPCReact' -e 'httpBatchLink' -e 'splitLink' -e 'usePillar' -e 'TRPC_PILLARS' -e 'AnyTRPCRouter' -e '/trpc' --glob '!docs/**'` → **0 hits** |
| G2  | No monolith / predecessors      | `apps/pops-api`, `apps/pops-core-api` do not exist; `ls apps/` shows no `pops-*-api` (modulo ha-bridge decision)                                                                                                              |
| G3  | No shared DB                    | `rg -n "getDrizzle\|getDb\(\|pops\.db\|backfill.*from.shared\|-handle\.(ts\|js)" --type ts --glob '!**/*.test.ts'` → **0 hits**                                                                                               |
| G4  | Repo-wide typecheck green       | `pnpm typecheck` green **repo-wide** (the "monolith is red-by-design" exception is gone once the monolith is gone)                                                                                                            |
| G5  | Boundaries enforced & in sync   | `pnpm lint:boundaries:verify` green; a `no-dead-<x>-pkgs` ban exists for **all 7** pillars (incl. core); the known-violations baseline is **empty**                                                                           |
| G6  | nginx is REST-only              | `apps/pops-shell/nginx.conf` has zero `/trpc` locations; every upstream has a backing compose service                                                                                                                         |
| G7  | compose is pillar-only          | every served pillar builds from `pillars/<x>/Dockerfile`; no `pops-api`/`pops-worker`/predecessor services; no `depends_on: core-api` chains                                                                                  |
| G8  | All 7 pillar CI workflows green | `<pillar>-quality.yml` green for lists, inventory, finance, food, media, cerebrum, **core**                                                                                                                                   |
| G9  | FE green                        | `fe-quality.yml` green repo-wide (not just per-app isolation); every `packages/app-*` ships only an `openapi-ts` client                                                                                                       |
| G10 | OpenAPI honest & idempotent     | per pillar: `generate:openapi && generate:api-types` leaves `git diff --exit-code` clean                                                                                                                                      |

## Where we are now (2026-06-19, branch `lake-migration` — after 04 Phase Cut `440618f2`; **structural migration complete**)

| Dimension                                             | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leaf pillars (lists, inventory, finance, food, media) | **Clean** — ts-rest, OpenAPI, own DB, deployed; leaf `AnyTRPCRouter` shims dropped (#3447)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| cerebrum                                              | **Clean & wired** — code clean (no `@trpc`); `cerebrum-api` compose service added (#3444)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| core                                                  | **Pillar clean (#3448)** — ts-rest contract, `./manifest`, own DB; no `/trpc`; raw `GET /core.registry.list` discovery. **01 complete: C1 finance-reclaim landed** (#3449/#3450/#3451/#3452). The monolith's `modules/core/{corrections,tag-rules,entities}` copies are now dead-by-design; their deletion is an `02` task                                                                                                                                                                                                                                       |
| Monolith `apps/pops-api`                              | **Deleted (#3457)** — directory, tRPC stack, jobs, runtime, and shared-DB substrate gone                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Predecessor `apps/pops-core-api`                      | **Deleted (#3457)** — compose `core-api` now builds `pillars/core` (dev); prod runs the last-published image until 04 Cut-A renames it                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Server-side cross-pillar SDK                          | **REST is the default** (tRPC fallback) — C4 landed server-side                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Browser `@pops/api-client`                            | **Deleted (B3, `cf70f329`)** — `@pops/api-client` package, shell `trpc.ts`/Provider/`/trpc` proxy, and `TRPC_PILLARS` all gone. **Zero `@trpc` deps remain in any workspace package**                                                                                                                                                                                                                                                                                                                                                                            |
| FE apps                                               | **app-finance fully off tRPC** (`992e65d4`) — 8 `entities` `usePillar*` sites → `core-api` Hey client; zero `usePillar`, no `@trpc`. **All 8 FE apps consume their own data via Hey API clients.** **Residual:** `pops-shell` itself still uses **REST-backed** `usePillar*` (8 files — features/settings/test-actions, all `('core',…)` → `/core-api` via the `pillar()` factory). Functionally REST, not tRPC — but it's the lone `usePillar*` holdout vs the literal goal; **decision pending** (convert to `core-api` Hey client, or accept the generic SDK) |
| Shared `pops.db`                                      | **Deleted (#3457)** — `db.ts`/`getDrizzle`/`getDb`, schema, seeder, migrations-runner, backfill, `*-sqlite-path`/`*-handle` all gone; each pillar owns its own SQLite                                                                                                                                                                                                                                                                                                                                                                                            |
| nginx / compose                                       | `pops-api`/`pops-worker` services removed + the `/trpc`→pops-api catch-all dropped (#3457); relocated routes (`/webhooks/up`→finance, `/api/inventory` + `/inventory/documents`→inventory) added; `/health`+`/pillars/health`→core. **nginx now REST-only** — all `/trpc-<x>` blocks removed (Phase Cut `440618f2`, drift-checked). Dev compose builds every pillar from `pillars/<x>/Dockerfile`. **Prod GHCR rename (`pops-<x>-api`→`pops-<x>`) is the deploy step**                                                                                           |
| CI                                                    | **GREEN** — `lint:boundaries:verify` up to date (#3444). The earlier "RED/drift" was a false positive: local untracked `packages/*-contract` crud tripped `discoverPillars`; absent on a clean checkout                                                                                                                                                                                                                                                                                                                                                          |

## Runbooks & sequencing

| Runbook                                                                  | Owns                                                                                                                                                              | Gated on                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`04-ci-docker-infra.md`](./04-ci-docker-infra.md) **Phase 0**           | Fix CI boundary drift, add missing compose services, fix broken dev refs, delete dead shells                                                                      | ✅ **DONE (#3444)** — all 6 items verified                                                                                                                                                                                                                            |
| [`01-core-pillar-completion.md`](./01-core-pillar-completion.md)         | Finish core: precursors C1/C3/C5, ts-rest contract, identity middleware, drop `/trpc`, `./manifest`                                                               | **✅ COMPLETE** — core pillar (#3448, C3+C5, tRPC dropped, manifest published) + **C1 finance reclaim landed** (#3449/#3450/#3451/#3452). Monolith copy deletion is `02`                                                                                              |
| [`03-frontend-rest-cutover.md`](./03-frontend-rest-cutover.md)           | Browser client → REST, `app-finance` conversion, remove tRPC shims, drop `TRPC_PILLARS`                                                                           | **Track A/B/C ✅ · B3 ✅ (`cf70f329`)** — browser tRPC client deleted, `TRPC_PILLARS` gone, app-finance entities → Hey client (`992e65d4`). **Residual:** `pops-shell` REST-backed `usePillar*` (decision pending) + 6 stale `/trpc` e2e mocks                        |
| [`02-monolith-decommission.md`](./02-monolith-decommission.md)           | Relocate stray monolith routes, delete `apps/pops-api` + `apps/pops-core-api` + shared `pops.db`                                                                  | **✅ DONE** — R1 up-bank→finance (#3453) · R2 inventory files→inventory (#3454) · app-finance + pops-mcp off `@pops/api` (#3455/#3456) · barrier delete (#3457). **Repo-wide `pnpm typecheck` GREEN** — red-by-design exception lifted                                |
| [`04-ci-docker-infra.md`](./04-ci-docker-infra.md) **Phase Cut**         | nginx cut to REST, compose → `pillars/` Dockerfiles, GHCR rename, core dead-pkg ban, clear baseline                                                               | **✅ DONE (`440618f2`)** — nginx `/trpc` blocks removed (drift-checked, `rg trpc nginx.conf`→0); `no-dead-core-pkgs` added (7/7 bans, empty baseline); dev compose builds all pillars from `pillars/<x>/Dockerfile`. **Prod GHCR rename is the deploy step (yours).** |
| [`05-features-registry.md`](./05-features-registry.md) **Features epic** | Port the deferred `features.*` to core REST (cross-pillar manifest + capability registry); fix the live settings bug; convert the shell + retire pillar-sdk hooks | **Design doc written — awaiting approval to build.** The last blocker for G1's literal end-state                                                                                                                                                                      |

### Dependency DAG (what runs in parallel)

```
DONE:  ✅ 04 Phase 0 (#3444) · Track B (#3446) · Track C (#3447) · 01 core pillar (#3448) · C1 finance reclaim (#3449–#3452)
       ✅ 02 monolith decommission (#3453–#3457) — monolith + predecessor + pops.db gone, repo typecheck GREEN
       ✅ B3 (cf70f329) browser tRPC client deleted · entities→Hey client (992e65d4) · 04 Phase Cut (440618f2) nginx REST-only
        │
        ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ STRUCTURAL MIGRATION DONE — tRPC eliminated as a transport:                │
  │   0 @trpc deps in any workspace pkg · 0 tRPC servers · 0 browser client ·  │
  │   0 /trpc routes (nginx clean) · monolith gone · per-pillar DBs ·          │
  │   repo typecheck GREEN (45/45) · boundaries green (7 bans, empty baseline) │
  └──────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  ☐ FINAL BLOCKER — features registry epic → see 05-features-registry.md
     pops-shell's last usePillar* sites call features.*, which has NO REST backend (deferred:
     cross-pillar manifest + capability registry). Design doc written; build → convert the shell
     + retire pillar-sdk hooks → G1 fully clears. Fixes the live settings getBulk/getMany bug too.
  ✅ e2e: 6 stale /trpc specs rewired to REST (f0129109).
  ☐ separate debt: Playwright harness still points at deleted apps/pops-api (no e2e runs) +
     more /trpc specs remain · stale comments (cosmetic)
  ☐ DEPLOY (yours): prod GHCR rename pops-<x>-api → pops-<x> + publish/cutover
        │
        ▼
       DONE  (global gate G1–G10)
```

**Status:** `01`, `02`, `03` (incl. B3), and `04 Phase Cut` are **complete** — the **structural
migration is done**: tRPC is eliminated as a transport (0 `@trpc` deps, 0 tRPC servers, 0 browser
client, 0 `/trpc` routes), the monolith/predecessor/`pops.db` are gone, every pillar owns its DB,
and repo-wide `pnpm typecheck` (45/45) + `lint:boundaries:verify` (7 bans, empty baseline) + the
nginx drift gate are green. **What remains is not structural:** (1) `pops-shell` still calls
**REST-backed** `usePillar*` in 8 files — a goal-interpretation decision (convert to the `core-api`
Hey client like the 8 apps, or accept the generic SDK); (2) 6 e2e specs still mock `/trpc/...` and
must be rewired to REST; (3) a couple of stale comments. The **prod GHCR image rename** (`pops-<x>-api`
→ `pops-<x>`) + publish/cutover is the deploy step on your side.
Pre-existing red-by-design CI checks that remain until `04`: docker-build (stale `pops-*-api`
Dockerfiles, [#3459](https://github.com/knoxio/pops/issues/3459)), Playwright E2E (boots the
deleted monolith, [#3458](https://github.com/knoxio/pops/issues/3458)), and the
moltbot/worker-food consumer rewrites ([#3460](https://github.com/knoxio/pops/issues/3460)).

## Process rules (carry forward — apply on every PR)

- `lake-migration` is **unprotected → squash-merge**.
- The husky **pre-push hook runs repo-wide `pnpm typecheck`**, which is **red-by-design until
  `02` lands** (the monolith imports deleted packages). Push with `--no-verify` **after** the
  _scoped_ pillar typecheck passes in isolation. This exception **expires** when `02` deletes the
  monolith — after that, repo-wide typecheck must be green (G4).
- Generators must be **idempotent** — CI runs `git diff --exit-code` after
  `generate:openapi` + `generate:api-types`. Rebuild + re-diff before pushing.
- After `gh pr merge`, expect a stray `apps/pops-api/src/generated/known-routers.ts`
  regeneration — `git checkout --` it, then `git pull --ff-only`. (This step also dies with `02`.)
- When the dep-cruiser baseline / `pnpm-lock.yaml` / shared routing files conflict, **rebase and
  regenerate** — never hand-merge.

## Open question — `apps/pops-ha-bridge-api`

`pops-ha-bridge-api` (Home Assistant WebSocket bridge, port 3008, 36 src files) is live but is
**not** one of the 7 target pillars and has no `pillars/ha-bridge`. Decide before `02`:

- **Keep** as a deliberate standalone service (then it is out of scope and `02`'s "no `pops-*-api`"
  gate is amended to exclude it), **or**
- **Collapse** it into a `pillars/ha-bridge/` pillar (then it gets its own mini-runbook mirroring
  the leaf recipe). This plan assumes **keep-standalone** until decided.
