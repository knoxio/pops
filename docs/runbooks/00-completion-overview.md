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

## Where we are now (2026-06-19, branch `lake-migration` — updated after #3457; **01 + 02 complete**)

| Dimension                                             | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Leaf pillars (lists, inventory, finance, food, media) | **Clean** — ts-rest, OpenAPI, own DB, deployed; leaf `AnyTRPCRouter` shims dropped (#3447)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| cerebrum                                              | **Clean & wired** — code clean (no `@trpc`); `cerebrum-api` compose service added (#3444)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| core                                                  | **Pillar clean (#3448)** — ts-rest contract, `./manifest`, own DB; no `/trpc`; raw `GET /core.registry.list` discovery. **01 complete: C1 finance-reclaim landed** (#3449/#3450/#3451/#3452). The monolith's `modules/core/{corrections,tag-rules,entities}` copies are now dead-by-design; their deletion is an `02` task                                                                                                                                                                                                                                                                 |
| Monolith `apps/pops-api`                              | **Deleted (#3457)** — directory, tRPC stack, jobs, runtime, and shared-DB substrate gone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Predecessor `apps/pops-core-api`                      | **Deleted (#3457)** — compose `core-api` now builds `pillars/core` (dev); prod runs the last-published image until 04 Cut-A renames it                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Server-side cross-pillar SDK                          | **REST is the default** (tRPC fallback) — C4 landed server-side                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Browser `@pops/api-client`                            | Still tRPC machinery (`createTRPCReact`/`splitLink`, 6 src files, imported by shell + app-finance) — removed in **B3, now UNBLOCKED** (02 done). `TRPC_PILLARS` already `[]`                                                                                                                                                                                                                                                                                                                                                                                                               |
| FE apps                                               | **No live FE call hits the monolith `/trpc` (verified)**; nudge + search REST (#3446), corrections cut to finance REST (#3452), `app-finance` **off `@pops/api`** (#3455). **Residual:** 8 `entities` `usePillar*` call-sites resolve to **core over REST** (`/core-api`, not the monolith — `pillar()` factory REST-default), and `app-finance` + `pops-shell` + `pops-mcp` still carry a `@trpc/server` dep (the browser `@pops/api-client`). Tail → entities to the `core-api` Hey client; the browser client dies in **B3**. G1's `usePillar`/`@trpc` clauses stay red until both land |
| Shared `pops.db`                                      | **Deleted (#3457)** — `db.ts`/`getDrizzle`/`getDb`, schema, seeder, migrations-runner, backfill, `*-sqlite-path`/`*-handle` all gone; each pillar owns its own SQLite                                                                                                                                                                                                                                                                                                                                                                                                                      |
| nginx / compose                                       | `pops-api`/`pops-worker` services removed + the `/trpc`→pops-api catch-all dropped (#3457); relocated routes (`/webhooks/up`→finance, `/api/inventory` + `/inventory/documents`→inventory) added; `/health`+`/pillars/health`→core. Per-pillar `/trpc-<x>` blocks + GHCR rename remain for 04 Phase Cut                                                                                                                                                                                                                                                                                    |
| CI                                                    | **GREEN** — `lint:boundaries:verify` up to date (#3444). The earlier "RED/drift" was a false positive: local untracked `packages/*-contract` crud tripped `discoverPillars`; absent on a clean checkout                                                                                                                                                                                                                                                                                                                                                                                    |

## Runbooks & sequencing

| Runbook                                                          | Owns                                                                                                | Gated on                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`04-ci-docker-infra.md`](./04-ci-docker-infra.md) **Phase 0**   | Fix CI boundary drift, add missing compose services, fix broken dev refs, delete dead shells        | ✅ **DONE (#3444)** — all 6 items verified                                                                                                                                                                                                                                        |
| [`01-core-pillar-completion.md`](./01-core-pillar-completion.md) | Finish core: precursors C1/C3/C5, ts-rest contract, identity middleware, drop `/trpc`, `./manifest` | **✅ COMPLETE** — core pillar (#3448, C3+C5, tRPC dropped, manifest published) + **C1 finance reclaim landed** (#3449/#3450/#3451/#3452). Monolith copy deletion is `02`                                                                                                          |
| [`03-frontend-rest-cutover.md`](./03-frontend-rest-cutover.md)   | Browser client → REST, `app-finance` conversion, remove tRPC shims, drop `TRPC_PILLARS`             | **Track B ✅ · Track C ✅ · Track A: corrections ✅(#3452), `app-finance` off `@pops/api` (#3455); ☐ entities `usePillar*`→`core-api` Hey client + drop `@trpc/server`**; **B3 + `TRPC_PILLARS` + browser client now UNBLOCKED** (02 landed #3457 — the monolith `/trpc` is gone) |
| [`02-monolith-decommission.md`](./02-monolith-decommission.md)   | Relocate stray monolith routes, delete `apps/pops-api` + `apps/pops-core-api` + shared `pops.db`    | **✅ DONE** — R1 up-bank→finance (#3453) · R2 inventory files→inventory (#3454) · app-finance + pops-mcp off `@pops/api` (#3455/#3456) · barrier delete (#3457). **Repo-wide `pnpm typecheck` GREEN** — red-by-design exception lifted                                            |
| [`04-ci-docker-infra.md`](./04-ci-docker-infra.md) **Phase Cut** | nginx cut to REST, compose → `pillars/` Dockerfiles, GHCR rename, core dead-pkg ban, clear baseline | 01 + 02 + 03                                                                                                                                                                                                                                                                      |

### Dependency DAG (what runs in parallel)

```
DONE:  ✅ 04 Phase 0 (#3444)  ·  ✅ 03 Track B (#3446)  ·  ✅ 03 Track C leaves + app-food (#3447/5a6a0d4c/d1151dc0)
       ✅ 01 core pillar REST (#3448: drop /trpc · publish manifest · C3 REST discovery · C5 schema relocation)
       ✅ C1 finance reclaim — ChangeSet (#3449) · entity-usage (#3450) · AI cluster (#3451) · corrections FE (#3452)
       ✅ 01 COMPLETE
        │
        ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ ✅ DONE — 02 monolith decommission                                         │
  │    R1 up-bank→finance (#3453) · R2 inventory files→inventory (#3454)       │
  │    app-finance + pops-mcp off @pops/api (#3455/#3456)                      │
  │    barrier delete: apps/pops-api + apps/pops-core-api + pops.db +          │
  │    core-db/core-contract (#3457) — repo-wide typecheck GREEN               │
  └──────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  ☐ NEXT — 03 B3 — kill /trpc catch-all + browser @pops/api-client + TRPC_PILLARS    ← unblocked by 02
        │
        ▼
  04 Phase Cut — nginx REST-only · compose → pillars/ · GHCR rename · empty baseline    ← needs 01+02+03
        │
        ▼
       DONE  (global gate G1–G10)
```

**Status:** `01` and `02` are **complete**. `02` landed across five PRs — R1 up-bank→finance
(#3453), R2 inventory file routes→inventory (#3454), `app-finance` + `pops-mcp` off `@pops/api`
(#3455/#3456), and the barrier delete of `apps/pops-api` + `apps/pops-core-api` + the shared
`pops.db` + `@pops/core-db`/`@pops/core-contract` (#3457). **Repo-wide `pnpm typecheck` is now
GREEN** (V5) and `pnpm build` green (V6) — the "monolith is red-by-design" exception is lifted.
**The migration's next gate is `03` B3** — delete the shell `/trpc` catch-all + the browser
`@pops/api-client` package + `TRPC_PILLARS` (now unblocked: the monolith `/trpc` is gone). Then
`04 Phase Cut` (nginx fully REST-only, compose → `pillars/` images, GHCR rename, empty baseline).
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
