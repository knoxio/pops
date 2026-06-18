# Finance pillar migration — scattered tRPC → collapsed REST pillar

Goal: bring `finance` to the same end state as `lists` (#3332–#3335) and `inventory`
(#3336–#3338) — a collapsed `pillars/finance/` that serves REST from a ts-rest
contract, honest OpenAPI, a per-consumer Hey API FE client, scoped CI
(`finance-quality.yml`) green, and the dead `@pops/finance-*` package names banned.

Follow the generic recipe in [`pillar-rest-migration.md`](../../../../../docs/runbooks/pillar-rest-migration.md);
this doc records only what is **different** for finance. Finance is the smallest /
easiest of the remaining pillars (cf. food/media), but its code is the most
**scattered**.

## Starting state (today)

Finance is split across **three** locations plus standalone packages — nothing is
in a `pillars/finance/` yet (it doesn't exist):

| Where                                | What                                                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/finance-db`                | schema + services (standalone pkg, ~52 src files)                                                                                                          |
| `packages/finance-contract`          | zod schemas / types / settings (standalone pkg, ~21 src files)                                                                                             |
| `apps/pops-finance-api/src/modules/` | ~16 procedures already relocated (transactions, budgets, wishlist) on tRPC, + a `cron/` (reconcile-cross-pillar, pillar-lookup) + health/manifest scaffold |
| `apps/pops-api/src/modules/finance/` | ~26 procedures still in the monolith (imports, tag-suggester, + the rest of transactions/budgets/wishlist)                                                 |

- **~42 procedures total**, ~6 domains: `transactions`, `budgets`, `wishlist`,
  `imports`, `tag-suggester`. (Smallest remaining surface — cf. food ~97, media ~215.)
- **FE**: `packages/app-finance` — ~112 `usePillar*` hooks across ~36 files.
- Auth: mostly `protectedProcedure`.
- Async / external: an **AI categorizer** (`imports/lib/ai-categorizer-api.ts`,
  synchronous), **statement/CSV imports** (file upload + parse), and a
  **cross-pillar reconcile cron** (`apps/pops-finance-api/src/cron/reconcile-cross-pillar.ts`).
  No bank-feed/queue integration.
- **Cross-pillar coupling**: core's `tag-rules` (`apps/pops-api/src/modules/core/tag-rules/`)
  reads `@pops/finance-contract` / finance transactions; the reconcile cron reads
  peer pillars. (core-api registry tests reference finance only for discovery.)

## Decisions (confirmed)

- **Target = new `pillars/finance/`** (match lists/inventory/food). Consolidate
  `packages/finance-db` → `src/db`, `packages/finance-contract` → `src/contract`,
  **both** handler sets (`apps/pops-finance-api/src/modules/*` + the monolith's
  `apps/pops-api/src/modules/finance/*`) → `src/api/`, then **retire
  `apps/pops-finance-api`** (its `apps/pops-*-api` shape is the predecessor that
  lists/inventory/food already replaced with `pillars/<x>/` — their
  `apps/pops-*-api/src` are now empty stubs).
- **Phase 0 sliced by domain** — one move-PR per domain group.
- **Rewire cross-pillar onto REST now**: the reconcile cron stays in the finance
  pillar process and reads peers via their REST SDKs; `core/tag-rules` is rewired
  onto the finance REST surface (closes that consumer, like food's send-to-list).
- **Imports stay base64-in-JSON uploads; the AI categorizer stays request/response
  REST.** No multipart. No queueing the AI call.
- **Drop all auth** (docker-net trust; dispatcher authenticates) — verify no handler
  consumes identity per slice.

## Phase 0 — Collapse into `pillars/finance/` (still tRPC), sliced by domain

Scaffold `pillars/finance/` (the `@pops/finance` package: `src/{db,contract,api}`,
health/`pillars` probes, manifest, Dockerfile, `finance-quality.yml` — clone the
inventory pillar's layout). Then, per slice:

1. **db + contract relocate** — move `packages/finance-db` → `pillars/finance/src/db`
   and `packages/finance-contract` → `pillars/finance/src/contract`. Keep the
   `@pops/finance` exports map (`.`, `./manifest`, later `./openapi`, `./api-types`).
2. **handlers by domain** — move `transactions`, `budgets`, `wishlist` (the slices
   already half-in `apps/pops-finance-api`), then `imports`, then `tag-suggester`,
   from both `apps/pops-finance-api/src/modules/*` and `apps/pops-api/src/modules/finance/*`
   into `pillars/finance/src/api/`, carrying their services/inputs/types. Keep
   procedure paths (`finance.<domain>.*`) identical for a transparent cutover.
3. **cross-pillar rewires** (in the slices that own them):
   - reconcile cron → call peer pillars via their REST SDKs (openapi-fetch /
     Hey API) instead of direct db/contract imports.
   - `core/tag-rules` → read finance over its REST surface.
4. **retire `apps/pops-finance-api`** once empty.

Gotcha: finance-db/contract are consumed by `apps/pops-finance-api` AND the monolith
today — moving them in closes finance's dep graph; watch for monolith→finance import
cycles as handlers leave (same as food).

## Phase A — Drop tRPC, adopt ts-rest

Inventory #3336 recipe: ts-rest contract split per domain
(`src/contract/rest-<domain>.ts` + `rest-schemas.ts` + composer), handler factories
over the moved services, `generateOpenApi` with the zod-4 `schemaTransformer` +
`setOperationId: 'concatenated-path'` (+ `hoistDefinitions` if any recursive
schemas), `api-types.generated.ts`, drop auth, supertest tests.

Finance-specifics:

- **imports**: `POST .../imports` with the statement file as a base64 body field,
  decoded in the handler then parsed.
- **AI categorizer**: a synchronous `POST .../categorize` (or per existing path)
  request/response endpoint (accept the latency).
- **reconcile cron**: not a contract route — it runs in the pillar process and calls
  peers; expose a manual `POST .../reconcile` trigger only if the FE/ops needs it.

## Phase B — Generic primitives

Likely skip. Add only if a cross-pillar consumer needs a generic finance endpoint —
the `core/tag-rules` read (transaction query/preview) is the candidate; give it a
generic transactions-search primitive rather than a tag-rules-shaped route.

## Phase C — Infra hygiene

dep-cruiser ban `no-dead-finance-pkgs` on
`@pops/(app-finance-db|finance-db|finance-contract|finance-api)`; baseline remaining
known violations; strip dead finance `COPY`/`WORKDIR`/build steps from
`apps/pops-api/Dockerfile`; dist cleanup. Mirror inventory #3337.

## Phase D — FE rewire + routing

`packages/app-finance` (~112 hooks / ~36 files) onto a Hey API client:
`openapi-ts.config.ts`, `src/finance-api-runtime-config.ts` (baseUrl `/finance-api`),
`src/finance-api-helpers.ts` (`unwrap` + status-aware `isNotFoundError` /
`isUnavailableError`), regenerate `src/finance-api/`, convert every
`usePillarQuery`/`usePillarMutation`/`usePillarUtils` to react-query + SDK with
explicit invalidation (keys `['finance', <module>, <op>, <input?>]`; mutations
invalidate `['finance', <module>]`). Routing: drop `finance` from `TRPC_PILLARS` /
split-link / shell trpc / vite regex; add the `/finance-api` dev proxy; add
`pillars/finance/openapi/**` to `fe-quality.yml`. Module-registry already discovers
collapsed pillars (generic `readCollapsedPillarPackage`) — no change.

## Phase E — Cross-pillar consumers

Handled inline in Phase 0 (reconcile cron + `core/tag-rules`). Remaining references
(`apps/pops-core-api` registry/heartbeat tests) are discovery-only. Add the
`apps/pops-api` finance-db importers to the dep-cruiser baseline until the monolith
module is deleted.

## Order of PRs

Phase 0 slices (scaffold + db/contract relocate → per-domain handler moves, with the
cross-pillar rewires in their owning slices) → Phase A → C → D → E. Each PR keeps
`finance-quality.yml` green; the rest of the lake stays red by design until
consumers migrate.
