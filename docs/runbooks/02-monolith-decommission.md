# 02 — Monolith & predecessor decommission

> **Status: ✅ DONE.** Landed across R1 up-bank→finance (#3453), R2 inventory file routes→inventory
> (#3454), `app-finance` + `pops-mcp` off `@pops/api` (#3455/#3456), and the barrier delete (#3457).
> All verification gates pass: V1 monolith+predecessor gone · V2 no shared-DB stack · V3 no dangling
> db imports · V4 dead packages gone · **V5 repo-wide `pnpm typecheck` GREEN** · V6 `pnpm build` green
> · V7 relocations routed (nginx `/webhooks/up`→finance, `/api/inventory` + `/inventory/documents`→
> inventory) · V8 no tRPC servers. Follow-ups deferred to 04 Phase Cut: docker-build / E2E harness /
> moltbot+worker-food consumer rewrites ([#3458](https://github.com/knoxio/pops/issues/3458),
> [#3459](https://github.com/knoxio/pops/issues/3459), [#3460](https://github.com/knoxio/pops/issues/3460)).

Parent: [`00-completion-overview.md`](./00-completion-overview.md). **Gated on
[`01-core-pillar-completion.md`](./01-core-pillar-completion.md)** — core must serve everything
the monolith's `modules/core` did, and finance must own everything `modules/finance` did, before
anything here can be deleted.

## Goal

Delete the monolith and the surviving predecessor **and the entire shared-DB substrate**:

- `apps/pops-api` (monolith, 325 src files) — **deleted**.
- `apps/pops-core-api` (predecessor, live duplicate of `pillars/core`) — **deleted**.
- Shared `pops.db`: `apps/pops-api/src/db.ts` (`getDrizzle`/`getDb`), `src/db/schema.ts`,
  `seeder.ts`, `migrations-runner.ts`, the per-pillar `*-handle.ts` + `*-sqlite-path.ts`
  resolvers, and `backfill-core-from-shared.ts` — **deleted**.
- `@pops/core-db` + `@pops/core-contract` packages — **deleted** (their last non-monolith
  importers were removed by `01`'s P5).
- The dangling `@pops/finance-db` / `@pops/inventory-db` imports (~41 sites, packages already
  gone) vanish with the monolith.
- The shared `embeddings_vec` on `pops.db` (`schema.ts:972`, `0033_embeddings_vec.sql`) dies with
  the schema; cerebrum already owns its own copy on `cerebrum.db`.

**When this lands, the "monolith is red-by-design" exception expires** — repo-wide `pnpm
typecheck` must go green (global gate G4).

## Three relocations FIRST (these are not deletes)

The monolith still hosts routes/jobs that have **no pillar home yet**. These must move before the
delete, or functionality is lost. They are mutually independent → **parallel**, and can start as
soon as their target pillar is REST-ready (now, for finance/inventory):

| Stray surface (in monolith)                                                                                                       | Target              | Notes                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/pops-api/src/routes/webhooks/up-bank.ts`                                                                                    | `pillars/finance`   | Up Bank webhook ingest → a finance pillar Express route (raw HTTP, not ts-rest)                  |
| `apps/pops-api/src/routes/inventory/{photos,documents,document-files}.ts`                                                         | `pillars/inventory` | Binary upload/serve routes → inventory pillar (mirror media's `/media/images` raw-route pattern) |
| Core-local schedulers in `apps/pops-api/src/index.ts` (`ai-alerts`, `ai-log-retention`, `ai-observability-summary`) + `src/jobs/` | `pillars/core`      | Moved with `01`'s ai-ops slice; confirm none remain registered at monolith boot                  |

`R1 (up-bank) ∥ R2 (inventory files) ∥ R3 (schedulers, owned by 01)`.

## Two ownership-confirmation tracks (parallel)

Before deleting, prove nothing live still needs the monolith modules. The dispatcher already
routes `finance.*`/`core.*` to the pillars; this is the audit that the routing is total.

- **T-finance:** confirm `pillars/finance` serves every `finance.*` procedure the FE / cross-pillar
  callers use; the monolith's `modules/finance` (65 .ts) + the `modules/core/{corrections,tag-rules}`
  finance reach-ins are dead. `rg "pillar\('finance'\)\|/finance-api" ` callers all resolve to the
  pillar; no caller hits `/trpc` for finance.
- **T-core:** confirm `pillars/core` (post-`01`) serves every `core.*` + `ego`/registry surface;
  the predecessor `pops-core-api` and monolith `modules/core` (127 .ts) are dead. The only remaining
  `/trpc` consumers were the shell's "global search + nudge bell" catch-all — those move to REST in
  `03` and must be repointed **before** the final delete.

## The delete (single barrier PR, after `01` + relocations + `03`'s nudge/search repoint)

1. Delete `apps/pops-api/src/modules/{core,finance}/**`, `src/routes/**` (after relocations),
   `src/jobs/**`, `src/runtime/**`, `src/generated/known-routers.ts`, `src/trpc.ts`, `src/router.ts`.
2. Delete the shared DB stack: `src/db.ts`, `src/db/**` (schema, seeder, migrations-runner,
   `backfill-core-from-shared.ts`, `finance-handle.ts`, all `*-sqlite-path.ts`, the broken
   `inventory-handle.js`/`lists-handle.js` import targets at `db.ts:13,15`).
3. Delete the directories `apps/pops-api` and `apps/pops-core-api` entirely.
4. Delete packages `packages/core-db` + `packages/core-contract` (gated on `01` V8).
5. Update root `package.json` — the `lint:boundaries` + `lint:boundaries:baseline` scripts
   (lines 12–13) hard-code `apps/pops-api/src/modules`; repoint or remove.
6. `pnpm-workspace.yaml` needs no edit (the `apps/*` glob simply stops matching), but run
   `pnpm install` to drop the workspace links and prune `pnpm-lock.yaml`.

Compose / nginx / GHCR removal for the deleted services is **`04` Phase Cut**, not here — but it
must land in the **same merge window** so deploy never points at a deleted Dockerfile.

## Verification (Done when)

| #   | Check                         | Signal                                                                                                                                         |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Monolith gone                 | `test ! -d apps/pops-api && test ! -d apps/pops-core-api`                                                                                      |
| V2  | No shared DB                  | `rg -n "getDrizzle\|getDb\(\|pops\.db\|backfill.*from.shared\|finance-handle\|core-sqlite-path" --type ts --glob '!**/*.test.ts'` → **0**      |
| V3  | No dangling db imports        | `rg -n "@pops/(finance\|inventory\|core)-db" --glob '!docs/**'` → **0**                                                                        |
| V4  | Dead packages gone            | `packages/core-db`, `packages/core-contract` do not exist                                                                                      |
| V5  | **Repo-wide typecheck GREEN** | `pnpm typecheck` (no `--filter`) green — the red-by-design exception is now lifted                                                             |
| V6  | Repo build green              | `pnpm build` green                                                                                                                             |
| V7  | Relocations live              | Up Bank webhook reachable on finance; inventory photo/document upload+serve reachable on inventory; core schedulers running in the core pillar |
| V8  | No tRPC servers               | `rg -n "createExpressMiddleware\|initTRPC" apps/ pillars/` → **0** (core dropped its mount in `01`)                                            |

V5 is the headline: this is the PR where the repo first compiles end-to-end.

## Gotchas

- **Relocate before you delete.** `up-bank.ts` and the inventory file routes have no pillar
  equivalent yet — deleting the monolith without moving them silently drops bank-feed ingest and
  inventory attachments.
- **Repoint the shell catch-all first.** `pops-shell`'s `/trpc` catch-all still serves global
  search + the nudge bell off the monolith. `03` must move those to REST **before** this delete,
  or those two features 502.
- **One barrier, not a trickle.** The big delete is a single squash-merge: partial deletes leave
  the boot path importing files that no longer exist (the `db.ts:13,15` broken handles are already
  an example of this hazard).
- **core-db/core-contract are gated.** Do not delete them until `01` V8 proves no peer imports them.
