# Federated query orchestrator — unbuilt extensions

Specified for the [federated query orchestrator](../themes/federation/prds/federated-query-orchestrator/README.md)
but not implemented. The shipped orchestrator fans out, isolates failures, and
merges sections; these four refinements are open.

## Per-adapter timeout

A slow or hung pillar `/search` is currently bounded only by the SDK transport.
Add an explicit per-pillar deadline (an `AbortSignal` with a short budget, e.g.
3s) so a stalled pillar drops out of the fan-out instead of holding the whole
federated response. A timed-out pillar should be treated exactly like any other
best-effort failure: logged, skipped, surfaced through the partial-failure block
below.

## Partial-failure surfacing

The response is `{ sections }` only. A dropped pillar is logged server-side but
invisible to the caller, so the frontend cannot tell a complete result from a
degraded one. Add a `partial` block to `SearchAllResult` naming which pillars
were expected, which answered, and which were dropped (and why: timeout,
unavailable, threw). The shell renders an indicator ("got 4/5 pillars; results
may be incomplete"). This is the caller-facing half of the best-effort isolation
the orchestrator already does internally.

## Query-shape pre-filtering

The manifest search descriptor already carries a `queryShape`
(`supportsText` / `supportsTags` / `supportsDateRange` / `supportsScope`), but the
orchestrator ignores it and invokes every adapter unconditionally — each pillar
pays a parse-and-reject cost for queries it cannot serve. Pre-filter membership
by query shape in the fan-out: only dispatch to a pillar whose declared
`queryShape` covers the dimensions present in the parsed query. The descriptor
to drive this is in the manifest schema; only the orchestrator-side filter is
missing.

## Weighted cross-pillar ranking

`@pops/pillar-sdk` ships a pure weighted-sum `mergeResults`: normalise each
pillar's scores to `[0,1]`, multiply by a per-pillar weight from settings
(`search.pillarWeights.<pillarId>`), sort descending, tie-break on registry
insertion order, and fall back to a locale-independent name comparison when
every adjusted score is 0. The federated engine does **not** consume it — it
runs a plain per-section score sort with context-first ordering, so cross-pillar
relevance weighting has no effect. Wire `mergeResults` into the federated engine
and source the weights from settings to make the per-pillar weights live.
