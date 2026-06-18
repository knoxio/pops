# US-10: Scope Reconciliation Against Existing Vocabulary

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Done

## Description

As the Cerebrum system, I need to reconcile user-suggested scopes against the existing scope vocabulary so that when a user types a scope that has the same intent as an established one (segment reorder, partial match, typo, depth mismatch), the post-ingest review (US-07) can propose the canonical version and prevent vocabulary drift over time.

## Acceptance Criteria

- [x] Reconciliation accepts `{ suggestedScopes: string[], knownScopes: Array<{ scope: string, count: number }> }` (the known-scopes shape returned by `cerebrum.scopes.list`) and returns `{ suggestions: Array<{ original: string, canonical: string, confidence: number, reason: string }> }`
- [x] Reconciliation runs deterministically as part of post-ingest enrichment for engrams with non-empty `scopes` whose source is `manual`, plus any other source that opts in via the engram's `customFields._reconcile_scopes: true`
- [x] **Segment-set match**: when the user's scope and an existing scope share the same set of segments in any order, the existing scope (highest usage count) is returned with `confidence: 0.95`, `reason: "same segments, different order"` — e.g. `work.karbon.meetings.fedx` reconciles to `work.karbon.fedx.meetings` if the latter exists
- [x] **Subset match**: when the user's scope is a strict subset of an existing scope's segments and the existing scope has higher usage, the existing scope is returned with `confidence: 0.85`, `reason: "matches longer canonical scope"` — e.g. `karbon.meetings` reconciles to `work.karbon.fedx.meetings` if that exists with significant usage
- [x] **Prefix match where canonical is shallower**: when the user's scope is a strict superset and a shorter, more-used canonical exists, the canonical is returned with `confidence: 0.7`, `reason: "matches shorter canonical scope"` — used to prevent over-specification when the established taxonomy is broader
- [x] **Single-segment edit distance**: when the user's scope differs from an existing scope by a single segment with Levenshtein distance ≤ 2 (typos like `karbn` → `karbon`), the existing scope is returned with `confidence: 0.8`, `reason: "likely typo in segment <n>"`
- [x] When multiple match types apply, the highest-confidence match wins; ties are broken by usage count of the canonical scope
- [x] Suggestions are not returned when the user's scope is already an exact match against the index (no proposal needed) or when no candidate clears `confidence: 0.6`
- [x] Suggestions previously dismissed for the same engram (per `_scope_suggestions_dismissed` custom field, keyed by canonical segment-set) are not re-proposed
- [x] The reconciliation runs in the curation worker and writes results to the engram's `_scope_suggestions` custom field; the worker logs the original/canonical pair for observability
- [x] A `cerebrum.scopes.reconcile` API procedure exposes reconciliation for testing and for client-side preview before submit (input: `suggestedScopes: string[]`, output: same `{ suggestions }` shape as the in-pipeline call)
- [x] Reconciliation is purely lexical/structural — no LLM call, no network, runs in under 50 ms for an index of 10,000 scopes

## Notes

- This US is the algorithmic backbone of US-01's scope-as-suggestion semantics and US-07's "Did you mean" affordance. Without reconciliation, scope vocabulary drifts every time a user types a scope from memory under a different convention.
- Segment-set keys (used for the dismissal field) are sorted segment arrays joined by `|` — e.g. `work.karbon.fedx.meetings` → `fedx|karbon|meetings|work`. Two scopes that reconcile to the same canonical share the same key, so dismissing once dismisses for any rephrasing.
- Usage count from `cerebrum.scopes.list` is the only ranking signal; recency or per-source weighting is out of scope. Scopes with `count: 0` are excluded from candidates.
- The 50 ms budget is achievable with a precomputed segment-set → canonical map cached in memory and invalidated on scope mutation.
- This US does not change the three-tier scope inference for engrams that come in _without_ user-suggested scopes (PRD-081 US-06 handles that path). Reconciliation only runs when the user has provided scopes via the manual surface or via API with `_reconcile_scopes: true`.
- Reconciliation is a vocabulary concern, not an ingestion-pipeline concern — keep it co-located with the rest of the scope-management code rather than under the ingest module.
