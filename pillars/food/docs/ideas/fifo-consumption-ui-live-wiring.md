# FIFO consumption UI — live shortfall wiring

The shortfall-resolution UX (`ConsumePreviewPanel`, `ShortfallList`, `ShortfallRow`,
`BatchOverridePicker`, `useCookResolution`) is fully built and unit-tested in
isolation, and the **server** side is wired end-to-end: `POST /cook/mark-cooked`
applies `ConsumptionOverride[]`, and `POST /batches/search-for-consume` backs the
picker. What is **not** built is the path that feeds _real_ shortfalls from the
server into the live cook modal. Today the modal is inert on this axis:

- `prepareCook` (the only query powering the modal) returns `consumeNeeds` but
  **no shortfalls** — `CookPreparationSchema` has no `shortfalls` field and
  `prepare.ts` never computes one.
- `CookModal` calls `useCookResolution({ ..., shortfalls: [] })` with a hardcoded
  empty array, and `CookModalContent` mounts `ShortfallList shortfalls={[]}` /
  `ConsumePreviewPanel hasShortfalls={false}`.
- Net effect in production: the shortfall panel never renders, the preview never
  expands-on-shortfall, the picker is never reachable from the modal, and
  `unresolvedShortfallCount` is always `0`, so the Mark-cooked gate is a no-op.

The `LineShortfall` domain type already carries a docstring claiming it is
"Produced by `prepareCook`" — that claim is aspirational, not current.

## Work to make the feature reachable end-to-end

1. **Server: compute pre-flight shortfalls in `prepareCook`.** For each
   non-optional `LineConsumeNeed` at the requested scale, run a FIFO-coverage
   probe over non-deleted, non-empty batches matching `(variantId, prepStateId)`
   and emit a `LineShortfall { lineIndex, ingredientName, variantName,
prepStateLabel, needed, available, unit }` when `available < needed`. Add a
   `shortfalls: LineShortfall[]` field to `CookPreparationSchema` /
   `CookPreparation` so it crosses the wire. Note this probe is scale-dependent,
   so it must run per `scaleFactor` (the modal re-queries on scale change, or the
   FE recomputes `needed` and the server returns base availability — pick one and
   make `useCookResolution`'s reseed contract match).

2. **FE: thread real shortfalls through the modal.** Replace the two hardcoded
   `[]` literals (`CookModal` → `useCookResolution`, `CookModalContent` →
   `ShortfallList`) with `prep.shortfalls`, and drive
   `ConsumePreviewPanel hasShortfalls` from `shortfalls.length > 0`. Drop the
   "stub returning unresolvedCount: 0" language from the `CookModal` docstring.

3. **Tests: cover the wired path.** Add a `CookModal` (RTL) test where
   `prepareCook` returns a real shortfall and asserts: shortfall panel renders,
   Mark-cooked is disabled, resolving via override/external/partial enables it,
   and a scale change re-disables it. Today that behaviour is only exercised by a
   synthetic test host that injects fabricated shortfalls directly into the
   components — it does not prove the modal wiring.

Until (1)–(3) land, the consume-preview + shortfall-resolution experience is
**not user-reachable**; only the server override engine and the batch picker
endpoint are live.
