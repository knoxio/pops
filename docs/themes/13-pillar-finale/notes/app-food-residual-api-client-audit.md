# `@pops/api-client` Residual Audit — `packages/app-food`

PRD-227 / Theme-13 follow-up. Scoping pass only; no migration in this PR.

## Background

- PR [#3163](https://github.com/karbonhq/pops8/pull/3163) migrated the 118
  "trivial" `app-food` callsites (`usePillarQuery` / `usePillarMutation` /
  `usePillarUtils` swaps).
- PR [#3185](https://github.com/karbonhq/pops8/pull/3185) migrated the 5
  deferred sites (typed optimistic rollback, infinite query, cross-pillar,
  parallel queries, dual mutation). Its title implied that
  `@pops/api-client` could be dropped from `packages/app-food/package.json`
  — but `grep -rln "@pops/api-client" packages/app-food/src/` still
  matches **78 files**, so the dep was kept.
- This audit categorizes those 78 so they can be cleared in named slices.

## Findings

### Total file count

```
$ grep -rln "@pops/api-client" packages/app-food/src/ | wc -l
      78
```

### Import shape

Every file that imports anything from `@pops/api-client` does so with the
**exact same** statement:

```ts
import type { AppRouter } from '@pops/api-client';
```

Verified by grepping for any import-from line that is not
`^import type \{ AppRouter \} from '@pops/api-client'` — zero hits.
No file imports `trpc`, `TRPC_FETCH_TIMEOUT_MS`, `isNetworkError`,
`createPillarSplitLink`, `CrossPillarBatchError`, or any other runtime
export.

`AppRouter` is consumed only as the generic parameter of
`inferRouterOutputs<AppRouter>['food']…` / `inferRouterInputs<AppRouter>['food']…`
to derive procedure input/output types.

### Categorisation

| Category                                                                              |  Count | Description                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Type-only import** (`AppRouter` used to derive procedure I/O types)              | **67** | Trivial textual rewrite. No runtime change.                                                                                                                                                                                                                                                                                                     |
| **B. Comment-only reference** (no actual import — only docstring / mock-related text) | **11** | Test-file headers describing legacy `vi.mock('@pops/api-client', …)` setups, plus one source file (`routes.tsx`) whose header comment names the package. One of the 11 (`pages/recipes/__tests__/RecipeDetailPage.test.tsx`) still declares an actual `vi.mock('@pops/api-client', () => ({ trpc: … }))` block; the other 10 are pure comments. |
| **C. Runtime import** (file calls a `trpc` procedure or imports a runtime helper)     |  **0** | None remaining. PRs #3163 and #3185 cleared every hook callsite.                                                                                                                                                                                                                                                                                |
| **D. Helper module re-export** (file re-exports a utility from `@pops/api-client`)    |  **0** | None.                                                                                                                                                                                                                                                                                                                                           |

### Per-folder breakdown

```
   29  pages/data/             (data-management tabs)
   14  pages/recipes/          (recipe detail + draft flows)
   11  pages/inbox/            (inbox + inspector)
    7  pages/fridge/           (fridge view + batch ops)
    7  components/             (cook modal + dsl-editor + hero-uploader)
    6  pages/plan/             (week-plan editor)
    2  pages/shopping/         (shopping list)
    1  pages/solve/            (solver result hook)
    1  routes.tsx              (comment-only)
   --
   78  total
```

`pages/data/` split:

```
   9   ingredients-tab/
   9   conversions-tab/
   4   aliases/
   2   substitutions-tab/
   2   substitutions-graph/
   1   tags-tab/
   1   prep-states/
   1   GlobalSearchBar.tsx
```

`components/` split:

```
   5   cook/                   (incl. one comment-only test header)
   1   dsl-editor/
   1   hero-image-uploader/
```

### Where `AppRouter` is consumed

Sample line from each category to make the migration shape concrete:

```ts
// Category A — typical type-only consumer
import type { AppRouter } from '@pops/api-client';
import type { inferRouterOutputs } from '@trpc/server';
type RecipeListOutput = inferRouterOutputs<AppRouter>['food']['recipes']['list'];
```

```ts
// Category B — RecipeDetailPage.test.tsx (the one residual vi.mock)
vi.mock('@pops/api-client', () => ({
  trpc: {
    food: { recipes: { prepareSendToList: { useQuery: () => idleQuery } } },
    lists: { list: { list: { useQuery: () => idleQuery } } },
  },
}));
```

## Migration shape

The clearing PR for any of the slices below performs the same mechanical
swap on every Category-A file. The two viable targets are:

1. **Re-source `AppRouter` from `@pops/api`.** `@pops/api-client`
   re-exports `AppRouter` from `@pops/api`
   (`packages/api-client/src/index.ts:96`). Swapping the import keeps
   every `inferRouterOutputs<AppRouter>['food'][…]` expression intact;
   `@pops/api` is already a transitive dep of `@pops/pillar-sdk` so no
   `package.json` churn beyond removing `@pops/api-client`.

2. **Switch to per-procedure contract types** (preferred — matches the
   migrated `app-inventory` precedent). Procedure outputs become
   per-module imports from `@pops/api/modules/food/...` or
   `@pops/food-contracts`. This drops the `inferRouterOutputs` indirection
   and makes the call site declare what it actually needs. Higher effort
   per file but cleaner.

Option (1) is the unblocking move — it lets us drop the
`@pops/api-client` dep from `packages/app-food/package.json` immediately.
Option (2) can run as a separate quality pass once the dep is gone.

The Category-B sweep is independent: 10 are pure comment edits, 1
(`RecipeDetailPage.test.tsx`) requires deleting the stale
`vi.mock('@pops/api-client', …)` block plus tightening the existing
`vi.mock('@pops/pillar-sdk/react', …)` (the page itself is already on
the SDK).

## Suggested slice plan

Each slice is sized for a single follow-up agent / PR. All four slices
are Category-A `import type` rewrites except where noted. The proposed
ordering keeps the noisy `pages/data/` rewrite isolated from the smaller,
higher-traffic flows.

### Slice 1 — `pages/data/` data-management tabs (29 files)

Folder: `packages/app-food/src/pages/data/**`
Coverage: every data-management tab (ingredients, conversions, aliases,
substitutions, substitutions-graph, tags, prep-states, GlobalSearchBar).
Largest slice; lowest cross-flow risk because the tabs are independent
of each other.

Estimated effort: ~30 min for option (1); ~2 h for option (2).

### Slice 2 — `pages/recipes/` + `pages/inbox/` editor flows (25 files)

Folders: `packages/app-food/src/pages/recipes/**` (14) +
`packages/app-food/src/pages/inbox/**` (11).
Both flows share the inspector / draft-editor pattern and were the
target of PR #3185's optimistic-rollback work, so the SDK plumbing is
already in place. Includes the lone Category-B test
(`RecipeDetailPage.test.tsx`) that still owns a
`vi.mock('@pops/api-client', …)` block — clear that block as part of
this slice.

Estimated effort: ~25 min for option (1).

### Slice 3 — `pages/fridge/` + `pages/plan/` + `pages/shopping/` + `pages/solve/` (16 files)

Folders: `pages/fridge/` (7) + `pages/plan/` (6) + `pages/shopping/` (2)

- `pages/solve/` (1). Grouped by "user-facing planning flows" — the
  fridge view feeds the plan editor which feeds the shopping/solve hooks.

Estimated effort: ~20 min for option (1).

### Slice 4 — `components/` + `routes.tsx` final sweep (8 files)

Folders: `packages/app-food/src/components/{cook,dsl-editor,hero-image-uploader}/`
(7) + `packages/app-food/src/routes.tsx` (1, comment-only).
After this slice, `grep -rln "@pops/api-client" packages/app-food/src/`
returns zero — at which point the dep is removed from
`packages/app-food/package.json` and the audit is closed.

Estimated effort: ~10 min for option (1).

## Blockers

None. There is no SDK affordance gap left:

- Hook surface is fully covered by `@pops/pillar-sdk/react`
  (`usePillarQuery`, `usePillarMutation`, `usePillarInfiniteQuery`,
  `usePillarUtils`, `usePillarQueries`). PRs #3163 and #3185 verified
  this end-to-end.
- The remaining `AppRouter` type imports do not require any new
  affordance; they can be re-sourced from `@pops/api` (option 1) without
  touching the SDK.

Option (2) — switching to per-procedure contract types — would benefit
from a `packages/food-contracts` audit (it currently exports 7 symbols,
which is unlikely to cover every `inferRouterOutputs<AppRouter>['food'][…]`
site). That's a separate scoping task, not a blocker for option (1).

## Verification commands

```bash
grep -rln "@pops/api-client" packages/app-food/src/ | wc -l        # 78

grep -rE "^import type \{ AppRouter \} from '@pops/api-client';" \
  packages/app-food/src/ | wc -l                                    # 67

# Files matched by grep but with no actual import line (comment-only).
for f in $(grep -rln "@pops/api-client" packages/app-food/src/); do
  grep -qE "from ['\"]@pops/api-client" "$f" || echo "$f"
done | wc -l                                                        # 11

# Any non-type-only runtime import?
grep -rE "^import [^t][^y]" packages/app-food/src/ \
  | grep "@pops/api-client" | wc -l                                 # 0
```
