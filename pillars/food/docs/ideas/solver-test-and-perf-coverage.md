# Solver test depth and performance guard

The cook solver ships and works, but its automated coverage is thinner than the behaviour deserves. `pillars/food/src/api/__tests__/solver.test.ts` has three REST-level tests (empty catalogue, filter-set accepted, invalid `recipeType` → 400). It does not exercise the cookability logic with seeded inventory, nor does it pin the sort order or guard performance.

Build these as integration tests against a seeded SQLite fixture:

- All required lines covered by FIFO → `subsNeeded = 0`, recipe cookable.
- One required line with no FIFO and no sub → recipe excluded from the result.
- One line covered by a substitution → `subsNeeded = 1`, cookable, and the `subs` breakdown lists the chosen edge (`lineIndex`, `from*`, `candidateSubName`, `substitutionId`).
- An optional line with zero stock → recipe still cookable; the line never appears in the breakdown.
- Sort: `subsNeeded ASC` primary, `lastCookedAt DESC NULLS LAST` secondary, `slug ASC` tertiary — assert across a fixture that forces all three tiebreaks.
- Filter composition: `recipeTypes`, `tags` (AND), `maxMinutes` (including null-minutes always-pass), and `excludeSubs` each narrow the result correctly and keep `totalCandidates` pre-`excludeSubs`.
- Performance: a 500-recipe seeded fixture (≈12 lines, ≈5 candidate subs per line, ~30k row reads) returns in under 200ms with headroom. If the guard fails, the likely fixes are caching the per-request inventory/sub index (already bulk-loaded) or adding indexes on `recipe_lines(version)`, `batches(variant, prep_state)`, and the substitution `from_*` columns.

Optionally add focused unit tests for `line-evaluator` (FIFO-vs-sub precedence, fail-closed on null canonical qty, prep-state fallback) and `substitutions-resolve` (recipe-scoped `(from,to)`-pair override, context-tag OR-overlap, wildcard empty `context_tags`), since those rules currently have no dedicated coverage.
