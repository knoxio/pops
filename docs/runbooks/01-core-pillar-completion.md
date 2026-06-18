# 01 — Core pillar completion (the last pillar)

Parent: [`00-completion-overview.md`](./00-completion-overview.md).

## Goal

Turn `pillars/core` from a "Phase-0 scaffold, still tRPC-era" into a **fully clean REST
pillar**, identical in shape to the five clean leaves. When this lands, the monolith and the
`pops-core-api` predecessor have nothing left to serve and `02` can delete them.

Core must end with:

- **No `/trpc` mount.** `src/api/app.ts` serves only ts-rest (`createExpressEndpoints`) plus
  the raw Express routes that ts-rest cannot model (registry SSE / heartbeat / `uri/resolve` /
  `/pillars`).
- **A real ts-rest contract.** `CoreRouter = AnyTRPCRouter` (`src/contract/router.ts:18`) is
  replaced by a typed `coreContract`; the `@trpc/server` dependency is gone.
- **A `./manifest` export** in `pillars/core/package.json` (currently missing).
- **Identity middleware** — `x-pops-user` → `ctx.user`, gating `service-accounts` (`userOnly`),
  `settings` writes, and `features`. Everything else trusts the docker net.
- **Its own DB** — `pillars/core/src/db` (`open-core-db.ts`) owns `core.db`; the standalone
  `@pops/core-db` / `@pops/core-contract` packages are deletable (precursor **P5**).
- **A collapsed Dockerfile** — no `COPY packages/core-contract` / `packages/cerebrum-db`.

Core is special because it is **the registry every other pillar reads** and it boots first.
It must keep answering `/pillars` and the SSE `/registry/subscribe` stream **throughout** —
the registry must not blink during its own migration.

## Precursors (gate the ts-rest conversion)

Status carried from the audit — **two are already largely landed**:

| #   | Precursor                                                                                                            | Status                   | Remaining work                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Finance reclaim** — `corrections`, `tag-rules`, `entities`↔`transactions` join live in `pillars/finance`, not core | Partial                  | Confirm the pillar owns them; the monolith copies (`apps/pops-api/src/modules/core/{corrections,tag-rules,entities}`) are dead-by-design and removed in `02`                                                                                    |
| C2  | **Orchestrator split** — `search` + AI-tool registry + cross-pillar embeddings                                       | **Landed**               | `pops-orchestrator` exists and serves `GET /ai/tools` (commit `4eec409c`). Verify `search` + embeddings/curation no longer live in core; nothing to do in core if so                                                                            |
| C3  | **`uri` → registry fold** — `/uri/resolve` becomes a core registry function                                          | **Open**                 | Fold `uri/resolve` into the core registry Express surface; remove the standalone module                                                                                                                                                         |
| C4  | **REST transport + dispatcher**                                                                                      | **Landed (server-side)** | `pillar()` defaults to REST (`packages/pillar-sdk/src/client/factory.ts:104-131`); all pillars have `/<x>-api` nginx routes. The _browser_ client is `03`'s problem, not core's                                                                 |
| C5  | **Schema relocation (PRD-245)** — peers stop importing `@pops/core-db`                                               | Partial                  | `packages/shared-schema` exists (owns `entities`, `aiInferenceLog`, `ENTITY_TYPES`). Repoint `pillars/finance` + `pillars/food` + inventory's type-only `CoreRouter` onto `@pops/shared-schema`, then `@pops/core-db`/`-contract` are deletable |

**C1, C3, C5 are mutually independent → run in parallel** (Wave P). C2/C4 need only verification.

## Wave P — precursors (parallel)

Three independent slices, one PR each, all keep `core-quality.yml` (and the touched pillar's
workflow) green:

- **P-C1 (verify finance reclaim).** Confirm `pillars/finance` owns `corrections`, `tag-rules`,
  and the `entities`↔`transactions` join. No core code change if confirmed; record the monolith
  modules as `02` deletions. `rg "getFinanceDrizzle\|finance\.transactions" pillars/core/src` → **0**.
- **P-C3 (uri → registry).** Move `/uri/resolve` into core's registry Express routes; delete the
  standalone `uri` module. The resolver stays raw HTTP (not ts-rest). `rg "uri/resolve" apps/pops-api`
  → moves to `pillars/core`.
- **P-C5 (schema relocation).** Repoint every peer importing `@pops/core-db` onto
  `@pops/shared-schema`:
  - `pillars/finance/src/db/schema.ts` (`entities`, `ENTITY_TYPES`)
  - `pillars/food/src/db/schema.ts` (`aiInferenceLog`)
  - inventory's type-only `CoreRouter` reference
    Verify with `rg "@pops/core-db" pillars/ --glob '!pillars/core/**'` → **0**.

## Wave A — ts-rest conversion (after Wave P)

Replace the opaque tRPC surface with a typed ts-rest contract, **fanned out per domain** —
each domain is its own `src/contract/rest-<domain>.ts` + handler factory, touching disjoint
files, so they **parallelise** up to the convergence step:

**Parallel domain slices** (one PR each):

1. **registry + uri** — folds C3's `uri/resolve`; registry stays Express (SSE subscribe,
   raw `register`/`heartbeat`/`deregister`, `/pillars`, `/pillars/health`). The contract
   _documents_ these shapes; the wire stays raw HTTP/SSE.
2. **settings** — the PRD-247 cross-pillar surface (`get/set/ensure/delete/getMany/setMany`)
   becomes the primary REST contract. Preserve `getMany`'s `Record<string,string>` /
   missing-keys-omitted semantics and `setMany`'s transactionality.
3. **service-accounts + users** — `service-accounts` is `userOnly` (admin CLI/MCP); needs
   identity middleware.
4. **ai-ops cluster** — `ai-usage`, `ai-budgets`, `ai-providers`, `ai-observability`,
   `ai-alerts` (+ their core-local schedulers, env-gated, wired into `server.ts`).
5. **entities + envs + features + shell** — small CRUD; `features` keeps its `ctx.user` read
   (identity middleware); `envs` keeps its Express shape.

**Convergence step** (single barrier PR, after all domain slices):

6. **Drop tRPC + publish manifest + collapse Dockerfile.**
   - Delete the `/trpc` mount (`src/api/app.ts:124-130`) and `createExpressMiddleware`.
   - Delete `CoreRouter = AnyTRPCRouter` (`src/contract/router.ts:18`, re-export `index.ts:10`);
     drop `@trpc/server` from `package.json`.
   - Add `./manifest` to `package.json` exports — **but only after** `@pops/core-contract`'s
     `./manifest` export is gone (P5 deletes the package), or the module registry
     double-registers `core`.
   - Strip `COPY packages/core-contract` + `packages/cerebrum-db` from `pillars/core/Dockerfile`.
   - Add the identity middleware (`x-pops-user` → `ctx.user`) covering service-accounts /
     settings-writes / features.

## Verification (Done when)

Core is complete when **all** pass:

| #   | Check                                 | Signal                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V1  | No tRPC in core                       | `rg -n "@trpc\|initTRPC\|createExpressMiddleware\|AnyTRPCRouter\|/trpc" pillars/core/src` → **0**                                                                                                                                                                              |
| V2  | Contract is ts-rest                   | `pillars/core/src/contract/router.ts` exports a `c.router`/`coreContract`; `package.json` has no `@trpc/server` dep                                                                                                                                                            |
| V3  | Manifest resolves once                | `node -e "require.resolve('@pops/core/manifest')"` succeeds; module-registry walk lists `core` **exactly once** (not double)                                                                                                                                                   |
| V4  | OpenAPI honest & idempotent           | `pnpm --filter @pops/core generate:openapi && generate:api-types` → `git diff --exit-code` clean                                                                                                                                                                               |
| V5  | Scoped quality green                  | `pnpm --filter @pops/core typecheck && test`; `core-quality.yml` green                                                                                                                                                                                                         |
| V6  | Registry never blinked (outage drill) | Boot core; `GET /pillars` answers immediately (synthetic self-entry + `reconcileRegistryOnBoot`); `GET /registry/subscribe` streams; kill+restart a peer → it re-registers and eviction fires. (Folds the `pillars/core/docs/runbooks/core-api-pillar-verification.md` drill.) |
| V7  | Settings over REST                    | `getMany` returns `Record<string,string>` with missing keys omitted; `setMany` is transactional — exercised via the generated `core-api` client, not tRPC                                                                                                                      |
| V8  | C5 closed                             | `rg "@pops/core-db" pillars/ --glob '!pillars/core/**'` → **0**; `@pops/core-db` + `@pops/core-contract` have no remaining importers except the about-to-die monolith                                                                                                          |

V8 is the unlock for deleting `@pops/core-db`/`-contract` in `02`/`04`.

## Parallelisation summary

- **Wave P:** C1 ∥ C3 ∥ C5 (3 PRs concurrently).
- **Wave A:** domain slices 1–5 ∥ (5 PRs concurrently), then slice 6 as a barrier.
- **Critical path:** P5 → A2/A3 (identity) → A6 (drop tRPC + manifest). Everything else fans
  off this spine.

## Gotchas (carried)

- **Don't blink the registry.** Don't move `/pillars` + `/pillars/health` + `/uri/resolve` off
  the monolith _and_ retire `pops-core-api` in the same PR — split the registry cutover from the
  predecessor retirement (`02`).
- **Keep identity.** Do not drop auth globally as the leaves did — `service-accounts` is the
  admin surface.
- **Manifest timing.** Adding `./manifest` to the pillar while `@pops/core-contract` still
  exports it double-registers `core` in the module walk. Order: P5 deletes the package → then
  add the pillar export (A6).
