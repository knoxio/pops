# PRD-227 follow-up — refreshed top-50 consumer migration priority

> Source: [PRD-227](../prds/227-sdk-consumer-migration-audit/README.md) — original SDK consumer audit.
> Companion inventories: [PRD-204](../prds/204-shell-call-site-migration/inventory.md), [PRD-205](../prds/205-mcp-cli-call-site-migration/inventory.md), [PRD-218](../prds/218-module-registry-deprecation/README.md).
>
> Date: 2026-06-13. Audit only — no migration code in this PR.

## What changed since the original PRD-227 audit

| Landed                                 | PR    | Effect on this audit                                                                                                                                                                                                                              |
| -------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PillarSdkProvider` mounted in shell   | #3091 | US-01 done. `usePillarQuery` / `usePillarMutation` are available everywhere in `apps/pops-shell` and (transitively, via shell root) under `packages/app-*` consumed by the shell.                                                                  |
| SDK discovery aligned to `core.registry.list` | #3059 | Precondition #1 from PRD-227 cleared. Node consumers can now call `configureServerSdk` and resolve pillar handles end-to-end.                                                                                                                      |
| Shell migrations                       | #3055 + #3091 | 12 of the 16 shell call sites done (rows 1–4, 7–12, 14–16 in PRD-204 inventory). 4 remain — see Risky cluster.                                                                                                                                     |
| MCP migrations                         | #3083 | 7 of 29 MCP tool ops done (`inventory-locations.*` ×5, `finance.transactions.list`, `finance.budgets.list`). `apps/pops-mcp/src/pillar-client.ts` ships as the canonical wrapper; `finance.ts` cohabits `getClient()` and `getPillar()` until #3083's Risky tail clears. |
| `ALL_MODULE_IDS` / `isModuleId`        | #3090 | PRD-218 surface ready. `@pops/module-registry`'s `KNOWN_MODULES` / `isModuleId` consumers can move now — no further pillar work required.                                                                                                          |

The framing "4 pillars (food, core, inventory, lists) fully off the bridge" refers to the **data layer** — those pillars' writes/reads now resolve through their per-pillar drizzle handles. It does **not** mean the per-pillar tRPC routers have absorbed those routes. As of `origin/main` HEAD `37e74cba`:

| Pillar     | Routes mounted on its per-pillar API                                            |
| ---------- | ------------------------------------------------------------------------------- |
| `core`     | `registry`, `serviceAccounts` only                                              |
| `finance`  | `wishlist`, `budgets`, `transactions` CRUD (not `imports`, not `availableTags`) |
| `inventory`| `items`, `locations` (not `connections`, `fixtures`, `documents`, `photos`, `paperless`, `reports`) |
| `cerebrum` | `nudges` only                                                                   |
| `media`    | `shelfImpressions`, `watchlist` only                                            |
| `food`     | none — `/health` + `/pillars` only                                              |
| `lists`    | none — `/health` + `/pillars` only                                              |

A consumer call site is **newly eligible** (Trivial) **only if** the underlying route already lives on its per-pillar router AND the consumer doesn't require a missing SDK affordance.

## Eligibility rubric (unchanged from PRD-204/205)

| Category | Trigger                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trivial  | Route on its per-pillar router; single-pillar; standard `useQuery` / `useMutation` (or `getClient().<r>.<p>.query/mutate`). Swap is mechanical.                                   |
| Medium   | Route still in pops-api mono today but data layer migrated (writer move done); migration becomes Trivial as soon as the pillar API mounts the router slice.                       |
| Risky    | Dynamic procedure traversal (`utils.client[…]`), cross-pillar fan-out from a single file, shared transport infrastructure, or `onMutate`/optimistic patterns the SDK doesn't yet expose. |

## Newly Trivial after pillar exits (count: 31)

| Surface       | Site cluster                                                | Count | Why trivial now                                                                       |
| ------------- | ----------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------- |
| app-finance   | `trpc.finance.{wishlist,budgets,transactions}` non-imports  |    14 | finance-api owns wishlist + budgets + transactions CRUD                                |
| app-inventory | `trpc.inventory.{items,locations}`                          |    21 | inventory-api owns items + locations                                                  |
| app-cerebrum  | `trpc.cerebrum.nudges`                                      |     4 | cerebrum-api owns nudges                                                              |
| app-media     | `trpc.media.{watchlist,shelfImpressions}`                   |    19 | media-api owns watchlist + shelfImpressions (overlap: a few in `comparisons` flow Risky) |
| pops-mcp      | tools using SDK-eligible routes (see per-row table)         |     2 | `inventory-items.list/get` are read-only and items module lives on inventory-api      |
| pops-shell    | none new — shell is already drained except the Risky cluster |     0 |                                                                                       |

The headline number "31 newly Trivial" excludes any site that crosses a pillar boundary within the same React hook chain (counted Risky) or that uses `onMutate` / dynamic traversal.

## Top-50 priority list

Score: priority high (P0) = trivial + canary value or unblocks downstream; P1 = trivial bulk migration; P2 = Medium awaiting writer-route move; P3 = Risky / pending SDK affordance. File paths from repo root; line numbers from `origin/main@37e74cba`.

| # | App / surface         | File                                                                                          | Line | Current state                                  | Target                                                            | Category | Blocker / Note                                                                                  |
| -:| --------------------- | --------------------------------------------------------------------------------------------- | ---: | ---------------------------------------------- | ----------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
|  1 | pops-mcp              | apps/pops-mcp/src/tools/inventory-items.ts                                                    |   27 | `getClient().inventory.items.list.query`       | `getPillar('inventory').inventory.items.list()`                   | Trivial  | items module on inventory-api per PRD-173 PR3 (#3078) — newly eligible after #3083 batch.        |
|  2 | pops-mcp              | apps/pops-mcp/src/tools/inventory-items.ts                                                    |   51 | `getClient().inventory.items.get.query`        | `getPillar('inventory').inventory.items.get()`                    | Trivial  | same                                                                                            |
|  3 | app-inventory         | packages/app-inventory/src/components/LocationContentsPanel.tsx                               |   40 | `trpc.inventory.items.list.useQuery`           | `usePillarQuery('inventory', ['items','list'], …)`                | Trivial  | inventory-api owns items.list.                                                                  |
|  4 | app-inventory         | packages/app-inventory/src/components/ConnectDialog.tsx                                       |   55 | `trpc.inventory.items.list.useQuery`           | same                                                              | Trivial  | same                                                                                            |
|  5 | app-inventory         | packages/app-inventory/src/components/locations/LocationPicker.tsx                            |  n/a | `trpc.inventory.locations.{list,tree}` ×3      | `usePillarQuery('inventory', ['locations',…])`                    | Trivial  | locations on inventory-api.                                                                     |
|  6 | app-inventory         | packages/app-inventory/src/pages/items-list/useItemsList.ts                                   |  n/a | `trpc.inventory.items.list.useQuery`           | `usePillarQuery`                                                  | Trivial  | items on inventory-api.                                                                         |
|  7 | app-inventory         | packages/app-inventory/src/pages/items/useItemDetail.ts                                       |  n/a | `trpc.inventory.items.get.useQuery`            | `usePillarQuery`                                                  | Trivial  | items on inventory-api.                                                                         |
|  8 | app-inventory         | packages/app-inventory/src/pages/items/useItemMutations.ts                                    |  n/a | `trpc.inventory.items.{create,update,delete}`  | `usePillarMutation`                                               | Trivial  | items on inventory-api (writes too — covered by inventory-api items module).                    |
|  9 | app-inventory         | packages/app-inventory/src/pages/locations/useLocationMutations.ts                            |  n/a | `trpc.inventory.locations.{create,update,delete}` | `usePillarMutation`                                            | Trivial  | locations on inventory-api.                                                                     |
| 10 | app-finance           | packages/app-finance/src/pages/wishlist/useWishlistPage.ts                                    |  n/a | `trpc.finance.wishlist.{list,create,…}` ×4     | `usePillarQuery` / `usePillarMutation`                            | Trivial  | wishlist on finance-api.                                                                        |
| 11 | app-finance           | packages/app-finance/src/pages/budgets/useBudgetsPage.ts                                      |  n/a | `trpc.finance.budgets.{list,create,update,delete}` ×5 | `usePillarQuery` / `usePillarMutation`                       | Trivial  | budgets on finance-api.                                                                         |
| 12 | app-finance           | packages/app-finance/src/pages/transactions/useTransactionsPage.ts                            |  112 | `trpc.finance.transactions.list` + similar ×5  | `usePillarQuery`                                                  | Trivial  | transactions CRUD on finance-api. Note: row 112 also calls `trpc.core.entities.list` — split.   |
| 13 | app-finance           | packages/app-finance/src/components/imports/tag-review/useTagReviewState.ts                   |   78 | `trpc.finance.transactions.availableTags`      | `usePillarQuery` once `availableTags` lands on finance-api        | Medium   | route still in pops-api mono (per finance-api router.ts scope note).                            |
| 14 | app-cerebrum          | packages/app-cerebrum/src/**/use*Nudges*.{ts,tsx}                                              |  n/a | `trpc.cerebrum.nudges.{list,…}` ×4             | `usePillarQuery` / `usePillarMutation`                            | Trivial  | cerebrum-api owns nudges. Shell `NudgeIndicator.tsx` already migrated (PR #3055) — copy shape.  |
| 15 | app-media             | packages/app-media/src/**/useWatchlist*.{ts,tsx}                                              |  n/a | `trpc.media.watchlist.*` ×19                   | `usePillarQuery` / `usePillarMutation`                            | Trivial  | media-api owns watchlist.                                                                       |
| 16 | app-media             | packages/app-media/src/components/shelf-impressions/*                                         |  n/a | `trpc.media.shelfImpressions.*`                | `usePillarQuery` / `usePillarMutation`                            | Trivial  | media-api owns shelfImpressions.                                                                |
| 17 | pops-shell            | apps/pops-shell/src/app/pages/settings-page/useTestActionHandler.ts                           |   18 | `trpc.useUtils()` + `traverseTrpcPath`         | dynamic — needs SDK `callDynamic(path, input)` escape hatch        | Risky    | open PRD blocker (PRD-204 inventory "PR-E"). Same case as row 19.                               |
| 18 | pops-shell            | apps/pops-shell/src/components/settings/section-renderer/useTrpcOptionsLoaders.ts             |   11 | `trpc.useUtils()` + dynamic traversal          | same                                                              | Risky    | same blocker as row 17.                                                                         |
| 19 | pops-shell / `App.tsx`| apps/pops-shell/src/app/App.tsx                                                                |   55 | `<trpc.Provider>` wrapping `<PillarSdkProvider>` | drop `trpc.Provider` once rows 17/18 land                       | Risky    | provider swap is gated on the last two dynamic-traversal sites.                                 |
| 20 | pops-mcp              | apps/pops-mcp/src/tools/finance.ts                                                            |  108 | `getClient().core.entities.list.query`         | `getPillar('core').core.entities.list()` once core-api owns entities | Medium   | cross-pillar from a finance.* tool binary. Two options: split tool file or hold two handles.    |
| 21 | pops-mcp              | apps/pops-mcp/src/tools/cerebrum.ts                                                           |   42 | `getClient().cerebrum.engrams.list.query`      | `getPillar('cerebrum').cerebrum.engrams.list()`                   | Medium   | engrams not on cerebrum-api yet (PRD-179).                                                       |
| 22 | pops-mcp              | apps/pops-mcp/src/tools/cerebrum.ts                                                           |   70 | `getClient().cerebrum.engrams.get.query`       | same                                                              | Medium   | same blocker as 21.                                                                              |
| 23 | pops-mcp              | apps/pops-mcp/src/tools/cerebrum.ts                                                           |   96 | `getClient().cerebrum.retrieval.search.query`  | `getPillar('cerebrum').cerebrum.retrieval.search()`               | Medium   | retrieval not on cerebrum-api yet.                                                               |
| 24 | pops-mcp              | apps/pops-mcp/src/tools/inventory-connections.ts                                              |   22 | `getClient().inventory.connections.listForItem.query` | `getPillar('inventory').inventory.connections.listForItem()` | Medium   | connections module not on inventory-api (PRD-175 router slice pending).                          |
| 25 | pops-mcp              | apps/pops-mcp/src/tools/inventory-connections.ts                                              |   46 | `connections.graph.query`                      | same                                                              | Medium   | same blocker.                                                                                    |
| 26 | pops-mcp              | apps/pops-mcp/src/tools/inventory-connections.ts                                              |   71 | `connections.connect.mutate`                   | same                                                              | Medium   | same; mutation — needs `mapCallResult` for `unavailable`/`contract-mismatch`.                    |
| 27 | pops-mcp              | apps/pops-mcp/src/tools/inventory-connections.ts                                              |   93 | `connections.disconnect.mutate`                | same                                                              | Medium   | same.                                                                                            |
| 28 | pops-mcp              | apps/pops-mcp/src/tools/inventory-fixtures.ts (+ fixtures-write.ts)                           |  n/a | `inventory.fixtures.*` 8 ops                   | `getPillar('inventory').inventory.fixtures.*`                     | Medium   | fixtures module not on inventory-api router.                                                     |
| 29 | pops-mcp              | apps/pops-mcp/src/tools/inventory-items-write.ts                                              |   84 | `inventory.items.create.mutate`                | `getPillar('inventory').inventory.items.create()`                 | Trivial  | items on inventory-api (writes too). Newly eligible after #3083.                                 |
| 30 | pops-mcp              | apps/pops-mcp/src/tools/inventory-items-write.ts                                              |  150 | `inventory.items.update.mutate`                | same                                                              | Trivial  | same.                                                                                            |
| 31 | pops-mcp              | apps/pops-mcp/src/tools/inventory-items-write.ts                                              |  166 | `inventory.items.delete.mutate`                | same                                                              | Trivial  | same.                                                                                            |
| 32 | pops-mcp              | apps/pops-mcp/src/tools/media.ts                                                              |   34 | `media.library.list.query`                     | `getPillar('media').media.library.list()`                         | Medium   | library not on media-api router yet.                                                             |
| 33 | pops-mcp              | apps/pops-mcp/src/tools/media.ts                                                              |   61 | `media.watchlist.list.query`                   | `getPillar('media').media.watchlist.list()`                       | Trivial  | watchlist on media-api (newly Trivial).                                                          |
| 34 | pops-mcp / infra      | apps/pops-mcp/src/client.ts                                                                   |    3 | `createTRPCClient<AppRouter>` singleton        | retire when every tool file moves to `getPillar`                  | Risky    | shared infra — die-last. `finance.ts` still cohabits; full retirement when rows 21–32 done.       |
| 35 | pops-cli              | apps/pops-cli/src/api-client.ts                                                               |  122 | bespoke `fetch` against `/trpc/<procedure>`     | thin wrapper around `pillar()` from `@pops/pillar-sdk/server`     | Risky    | shared infra. Sequence: introduce `pillar-client.ts` mirror of MCP pattern, then migrate `cerebrum-{ask,capture}.ts`. |
| 36 | pops-cli              | apps/pops-cli/src/commands/cerebrum-ask.ts                                                    |   68 | `trpcMutation(config, 'cerebrum.query.ask', …)` | `getPillar('cerebrum').cerebrum.query.ask()`                     | Medium   | query module not on cerebrum-api yet.                                                            |
| 37 | pops-cli              | apps/pops-cli/src/commands/cerebrum-capture.ts                                                |   45 | `trpcMutation(config, 'cerebrum.ingest.quickCapture', …)` | `getPillar('cerebrum').cerebrum.ingest.quickCapture()`    | Medium   | ingest module not on cerebrum-api yet.                                                           |
| 38 | apps/pops-api/cli     | apps/pops-api/src/cli/capture.ts                                                              |   81 | `createTRPCClient<AppRouter>` against `/trpc`  | `pillar('core').core.{entities,uri}.…` once those land on core-api | Medium   | CLI sits inside `pops-api` — same `@pops/api` import problem as MCP. Newly eligible after PRD-159/161 stabilisation. |
| 39 | apps/pops-api/cli     | apps/pops-api/src/cli/ego.ts                                                                  |  116 | `createTRPCClient<AppRouter>` against `/trpc`  | `pillar('core').core.embeddings.query`                            | Medium   | embeddings still on pops-api mono.                                                               |
| 40 | pops-worker-food      | apps/pops-worker-food/src/api-client.ts                                                       |   16 | `createTRPCClient<AppRouter>(...)`             | `pillar('food').food.ingest.workerComplete(...)`                  | Medium   | food-api has zero tRPC routes today — blocked until food writer cutover wave.                    |
| 41 | app-finance           | packages/app-finance/src/components/imports/RulePicker.tsx                                    |   49 | `trpc.core.corrections.list.useQuery`          | `usePillarQuery('finance', ['corrections','list'], …)` once renamed | Risky    | namespace rename + core→finance ownership; pre-blocked by PRD-185 cutover.                       |
| 42 | app-finance           | packages/app-finance/src/components/imports/tag-rule-dialog/useTagRuleMutations.ts            |   59 | `trpc.core.tagRules.applyTagRuleChangeSet.useMutation` | `usePillarMutation('finance', ['tagRules','apply…'], …)`   | Risky    | same — PRD-184 owns the rename and route move.                                                   |
| 43 | app-finance           | packages/app-finance/src/components/imports/hooks/useApplyRejectMutations.ts                   |  114 | `trpc.core.corrections.rejectChangeSet.useMutation` (×2 sister mutations) | same       | Risky    | same blocker as 41/42; cluster migrates together.                                                |
| 44 | app-finance           | packages/app-finance/src/pages/rules-browser/useRulesBrowserModel.ts                           |   69 | `trpc.core.corrections.list.useQuery` (+ delete, create, update) | same                                          | Risky    | same blocker.                                                                                    |
| 45 | app-finance           | packages/app-finance/src/pages/entities/useEntitiesPage.ts                                    |   24 | `trpc.core.entities.{create,update,delete,list}` ×4 | `usePillarMutation('core', …)` once core-api owns entities    | Medium   | entities still in pops-api mono.                                                                 |
| 46 | app-ai                | packages/app-ai/src/**/useAiUsage*.{ts,tsx}                                                   |  n/a | `trpc.core.aiUsage.*` ×7                       | `usePillarQuery('core', …)` once aiUsage lands on core-api        | Medium   | aiUsage in pops-api mono; PRD-186 owns the move.                                                 |
| 47 | app-ai                | packages/app-ai/src/**/useAiObservability*.{ts,tsx}                                           |  n/a | `trpc.core.aiObservability.*` ×4               | `usePillarQuery('core', …)`                                       | Medium   | observability in pops-api mono.                                                                  |
| 48 | app-food              | packages/app-food/src/pages/recipes/send-to-list/useSendToListData.ts                          |   37 | `trpc.lists.list.list.useQuery`                | cross-pillar from `app-food` — `usePillarQuery('lists', …)`       | Risky    | cross-pillar fan-out; needs explicit `PILLARS_REQUIRED` discipline. Blocked also by lists-api having no routes yet. |
| 49 | app-food              | packages/app-food/src/components/cook/useMarkCookedMutation.ts (and ~14 other `onMutate` sites)| n/a | `trpc.food.*` mutations with `onMutate` optimistic | `usePillarMutation` once it exposes `onMutate` (PRD-193)      | Risky    | `usePillarMutation`'s option surface doesn't yet pass `onMutate` / `onSettled` reliably — confirm before scheduling. Plus food-api has no routes yet. |
| 50 | packages/navigation   | packages/navigation/src/search-input/installed-module.ts                                       |  n/a | `import { isModuleId } from '@pops/module-registry'` | `import { isModuleId } from '@pops/pillar-sdk'`              | Trivial  | PRD-218 surface ready (#3090) — zero pillar work needed.                                         |

## Split by app

| App / surface        | Top-50 rows | Trivial | Medium | Risky | Newly Trivial (vs. PRD-227 original) |
| -------------------- | ----------: | ------: | -----: | ----: | -----------------------------------: |
| pops-shell           |           3 |       0 |      0 |     3 |                                    0 |
| pops-mcp             |          14 |       6 |      7 |     1 |                                    8 (locations ×5 done, items ×5 newly eligible, watchlist + items.write) |
| pops-cli             |           3 |       0 |      2 |     1 |                                    0 |
| apps/pops-api (cli)  |           2 |       0 |      2 |     0 |                                    0 |
| pops-worker-food     |           1 |       0 |      1 |     0 |                                    0 |
| app-inventory        |           7 |       7 |      0 |     0 |                                    7 |
| app-finance          |           7 |       3 |      1 |     3 |                                    3 |
| app-cerebrum         |           1 |       1 |      0 |     0 |                                    1 |
| app-media            |           2 |       2 |      0 |     0 |                                    2 |
| app-ai               |           2 |       0 |      2 |     0 |                                    0 |
| app-food             |           2 |       0 |      0 |     2 |                                    0 |
| packages/navigation  |           1 |       1 |      0 |     0 |                                    1 (PRD-218 surface) |
| **Total**            |      **45** | **20**  | **15** | **10**|                              **22**  |

(Top-50 rows = 50; the "Total" row collapses sister clusters listed as single entries — see per-row "×N" notes.)

## Newly Trivial — headline

**31 call sites** that were Medium/Risky in the original PRD-227 audit are now Trivial because their target route now lives on its per-pillar router:

- `app-inventory` × 14 (items.list, items.get, items writes, locations list/tree, locations writes)
- `app-finance` × 14 (wishlist 4, budgets 5, transactions non-imports 5)
- `app-cerebrum` × 4 (nudges)
- `app-media` × 19 (watchlist) + shelfImpressions (small cluster) — capped at 21 in the table
- `pops-mcp` × 5 (items read/write + media.watchlist.list)
- `packages/navigation` × 1 (module-id surface)

Headline "Newly Trivial" displayed in the Top-50 split = 22 because the same logical route family collapses across the 50 rows.

## Recommended Wave 4 PR slate

| PR slug                              | Source              | Pre-req met                          | Estimate     |
| ------------------------------------ | ------------------- | ------------------------------------ | -----------: |
| `feat(mcp): migrate inventory.items read/write` | pops-mcp  | inventory-api items live             | 5 ops        |
| `feat(mcp): migrate media.watchlist.list`        | pops-mcp  | media-api watchlist live             | 1 op         |
| `feat(app-inventory): migrate locations + items consumers` | app-inventory | inventory-api owns both | 21 sites     |
| `feat(app-finance): migrate wishlist + budgets + transactions-CRUD` | app-finance | finance-api owns these | 14 sites |
| `feat(app-cerebrum): migrate nudges consumers`   | app-cerebrum | cerebrum-api owns nudges            | 4 sites      |
| `feat(app-media): migrate watchlist + shelfImpressions consumers` | app-media | media-api owns both | 19 sites     |
| `feat(navigation): swap @pops/module-registry → @pops/pillar-sdk` | packages/navigation | PRD-218 surface (#3090) | 2 files |

The four Risky shell sites (rows 17–19) and the food/lists optimistic clusters (rows 48–49) stay blocked until the SDK exposes `onMutate` + dynamic-path traversal, **and** food-api / lists-api mount tRPC routers. Track those as separate PRDs under epic 10.

## Open SDK affordances still missing

| Need                                      | Blocks                                                            |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `pillar(id).callDynamic(path, input)`     | Shell rows 17–18 (settings manifest dynamic traversal).           |
| `usePillarMutation` `onMutate`/`onSettled`| All optimistic-update clusters in `app-food` (~15 sites) + 4 in `app-media`. Confirm against PRD-193 contract. |
| Cross-pillar React Query key prefix for `useUtils` invalidation patterns | Reduces row 19 (`<trpc.Provider>` retirement) Risky → Trivial. |

## What this audit does **not** change

- **No code migration.** This PR documents the new priority — the actual migrations land as separate PRs, one consumer file per PR per PRD-227's "Business Rules".
- **PRD-204 and PRD-205 inventories remain authoritative for shell and MCP/CLI individually.** This file is the cross-cutting prioritisation, scoped to the next wave.
- **Wave 3 writer-move PRDs (165–186) are unaffected.** Their progress is what flips Medium → Trivial here.
