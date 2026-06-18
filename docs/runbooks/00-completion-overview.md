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

## Where we are now (2026-06-18, branch `lake-migration`)

| Dimension                                             | State                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Leaf pillars (lists, inventory, finance, food, media) | **Clean** — ts-rest, OpenAPI, own DB, deployed                                                        |
| cerebrum                                              | Code clean (no `@trpc`), but **not wired as a served API** (no compose service)                       |
| core                                                  | **Partial** — still mounts `/trpc`, exports opaque `CoreRouter = AnyTRPCRouter`, missing `./manifest` |
| Monolith `apps/pops-api`                              | **Alive** — `modules/core` + `modules/finance` still served at `/trpc`                                |
| Predecessor `apps/pops-core-api`                      | **Alive** — live duplicate of `pillars/core` (compose deploys this, not the pillar)                   |
| Server-side cross-pillar SDK                          | **REST is the default** (tRPC fallback) — C4 landed server-side                                       |
| Browser `@pops/api-client`                            | **100% tRPC**                                                                                         |
| FE apps                                               | **7/8 on Hey API**; `app-finance` hybrid (25 `usePillar*` sites)                                      |
| Shared `pops.db`                                      | **Intact** in the monolith                                                                            |
| nginx / compose                                       | **Dual-stack & drifted** — both `/trpc-<x>` and `/<x>-api`; some routes 502 (no backing service)      |
| CI                                                    | **RED** — `lint:boundaries:verify` fails (boundary-rule drift after the cerebrum-db rewire)           |

## Runbooks & sequencing

| Runbook                                                          | Owns                                                                                                | Gated on                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`04-ci-docker-infra.md`](./04-ci-docker-infra.md) **Phase 0**   | Fix CI-red boundary drift, add missing compose services, fix broken dev refs, delete dead shells    | **nothing — do first, today**                  |
| [`01-core-pillar-completion.md`](./01-core-pillar-completion.md) | Finish core: precursors C1/C3/C5, ts-rest contract, identity middleware, drop `/trpc`, `./manifest` | 04-Phase-0 (green CI)                          |
| [`03-frontend-rest-cutover.md`](./03-frontend-rest-cutover.md)   | Browser client → REST, `app-finance` conversion, remove tRPC shims, drop `TRPC_PILLARS`             | independent start; final cut gated on 02       |
| [`02-monolith-decommission.md`](./02-monolith-decommission.md)   | Relocate stray monolith routes, delete `apps/pops-api` + `apps/pops-core-api` + shared `pops.db`    | **01** (core must serve what the monolith did) |
| [`04-ci-docker-infra.md`](./04-ci-docker-infra.md) **Phase Cut** | nginx cut to REST, compose → `pillars/` Dockerfiles, GHCR rename, core dead-pkg ban, clear baseline | 01 + 02 + 03                                   |

### Dependency DAG (what runs in parallel)

```
        ┌─────────────────────────────────────────────────────────┐
NOW ──▶  │ 04 Phase 0 (CI fix + compose services + dead-shell rm)  │  ← unblocks everything, fully parallel internally
        └─────────────────────────────────────────────────────────┘
              │
              ├──────────────▶ 01 core completion ──────────────▶ 02 monolith decommission ──┐
              │                (P1/P3/P5 precursors run parallel)                            │
              │                                                                               ▼
              └──────────────▶ 03 FE cutover (Track A app-finance + Track B nudge/search ──▶ 04 Phase Cut
                               repoint run NOW in parallel; shell /trpc removal waits)        (nginx + compose + baseline)
```

**Three tracks can run concurrently from day one:** `01` (core), `03` Track A (`app-finance`),
and `04 Phase 0` (CI/infra hygiene). `02` is the only hard barrier (needs `01`), and `04 Phase
Cut` is the final convergence (needs all three).

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
