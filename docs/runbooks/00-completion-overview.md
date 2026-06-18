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

## Where we are now (2026-06-18, branch `lake-migration` — updated after #3444–#3447)

| Dimension                                             | State                                                                                                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leaf pillars (lists, inventory, finance, food, media) | **Clean** — ts-rest, OpenAPI, own DB, deployed; leaf `AnyTRPCRouter` shims dropped (#3447)                                                                                                              |
| cerebrum                                              | **Clean & wired** — code clean (no `@trpc`); `cerebrum-api` compose service added (#3444)                                                                                                               |
| core                                                  | **Partial** — still mounts `/trpc`, exports opaque `CoreRouter = AnyTRPCRouter`, missing `./manifest` (drops in 01)                                                                                     |
| Monolith `apps/pops-api`                              | **Alive** — `modules/core` + `modules/finance` still served at `/trpc`                                                                                                                                  |
| Predecessor `apps/pops-core-api`                      | **Alive** — live duplicate of `pillars/core` (compose deploys this, not the pillar)                                                                                                                     |
| Server-side cross-pillar SDK                          | **REST is the default** (tRPC fallback) — C4 landed server-side                                                                                                                                         |
| Browser `@pops/api-client`                            | Still tRPC machinery (`split-link`/`createTRPCReact`) — removed in **B3** (gated on 02). `TRPC_PILLARS` already `[]`                                                                                    |
| FE apps                                               | **7/8 on Hey API**; nudge bell + global search now REST (#3446, B1/B2). **No live FE tRPC calls** except `app-finance` — the lone hybrid (18 files, Track A, blocked on C1)                             |
| Shared `pops.db`                                      | **Intact** in the monolith                                                                                                                                                                              |
| nginx / compose                                       | **Dual-stack** — both `/trpc-<x>` and `/<x>-api`; cerebrum-api + orchestrator services added (#3444), no more 502s; full REST cut is 04 Phase Cut                                                       |
| CI                                                    | **GREEN** — `lint:boundaries:verify` up to date (#3444). The earlier "RED/drift" was a false positive: local untracked `packages/*-contract` crud tripped `discoverPillars`; absent on a clean checkout |

## Runbooks & sequencing

| Runbook                                                          | Owns                                                                                                | Gated on                                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`04-ci-docker-infra.md`](./04-ci-docker-infra.md) **Phase 0**   | Fix CI boundary drift, add missing compose services, fix broken dev refs, delete dead shells        | ✅ **DONE (#3444)** — all 6 items verified                                                                                 |
| [`01-core-pillar-completion.md`](./01-core-pillar-completion.md) | Finish core: precursors C1/C3/C5, ts-rest contract, identity middleware, drop `/trpc`, `./manifest` | ✅ unblocked — **can start now** (Wave P)                                                                                  |
| [`03-frontend-rest-cutover.md`](./03-frontend-rest-cutover.md)   | Browser client → REST, `app-finance` conversion, remove tRPC shims, drop `TRPC_PILLARS`             | **Track B ✅(#3446) · Track C ✅(#3447, leaves)**; Track A blocked on C1; B3 + `TRPC_PILLARS` + browser client gated on 02 |
| [`02-monolith-decommission.md`](./02-monolith-decommission.md)   | Relocate stray monolith routes, delete `apps/pops-api` + `apps/pops-core-api` + shared `pops.db`    | **01** (core must serve what the monolith did)                                                                             |
| [`04-ci-docker-infra.md`](./04-ci-docker-infra.md) **Phase Cut** | nginx cut to REST, compose → `pillars/` Dockerfiles, GHCR rename, core dead-pkg ban, clear baseline | 01 + 02 + 03                                                                                                               |

### Dependency DAG (what runs in parallel)

```
✅ 04 Phase 0 — DONE (#3444): CI green · cerebrum-api + orchestrator services · dev refs fixed · shells gone
        │  (gate satisfied → parallel front open)
        ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ IN FLIGHT / NEXT                                                           │
  │  01 core completion ─────────────────────▶ 02 monolith ──┐                │
  │     Wave P:  C1 ∥ C3 ∥ C5   ☐ next                         decommission  │  │
  │       └▶ Wave A: domains 1–5 ∥ → A6 (drops core /trpc + shim)            │  │
  │                                                           ▼                │
  │  03 FE cutover                              03 B3 (kill /trpc catch-all ◀── needs 02
  │     Track B  ✅ DONE (#3446)  — nudge + search on REST       + browser client
  │     Track C  ✅ leaves done (#3447) — ☐ app-food orphan dep │  + TRPC_PILLARS)
  │     Track A  ⛔ blocked on C1 ────────────────────────────┘                │
  │              (correction-proposal AI engine ~4.7k LOC still monolith-only) │
  └──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                  04 Phase Cut (nginx REST-only · compose → pillars/ · GHCR rename · empty baseline)  ← needs 01+02+03
                                   │
                                   ▼
                                 DONE  (global gate G1–G10)
```

**Status:** `04 Phase 0` ✅, `03` Track B ✅ and Track C ✅ (leaves) are merged — the FE
issues **no live tRPC calls** now except `app-finance`. **Next unblocked work:** `01` (core,
Wave P = C1∥C3∥C5). Still gated: `02` needs `01`; `03` Track A needs **C1**; `03` B3 (browser
`@pops/api-client` removal + `TRPC_PILLARS` drop) and `04 Phase Cut` need `02`. Remaining tail
cleanup: drop the orphan `@trpc/server` dep in `app-food` (no import — do anytime).

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
