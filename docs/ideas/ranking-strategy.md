# Ranking strategy — unbuilt live wiring

Specified for the [ranking strategy](../themes/federation/prds/ranking-strategy/README.md)
but not wired into the runtime. The pure weighted-sum merge
(`@pops/pillar-sdk/ranking` — `mergeResults`, `pillarWeightSettingKey`,
`DEFAULT_PILLAR_WEIGHT`, `SETTINGS_KEY_PREFIX`) ships and is fully unit-tested.
What is missing is the path that makes it actually rank live search results.

## Wire `mergeResults` into the live orchestrator

The orchestrator pillar (`:3009`) serves `POST /search` through a section engine
that sorts each pillar's hits by raw `score`, caps each section, and orders
sections context-first then by top-hit score. It never invokes the weighted-sum
`mergeResults`. As a result, cross-pillar relevance weighting has no effect on
the endpoint the frontend actually calls.

The SDK already exposes the consumer: `runFederatedSearch` merges per-pillar
`ScoredResult[]` via `mergeResults` and accepts a `weights` map. Either route the
orchestrator's HTTP surface through that runner, or call `mergeResults` directly
inside the section engine, so the live ranking reflects per-pillar weights and
per-query normalisation instead of a flat raw-score sort.

Note the model mismatch to resolve: the live engine returns **sectioned** results
(one section per pillar, context-first), whereas `mergeResults` returns one flat
ranked list across pillars. A decision is needed on whether weighted ranking
applies within sections, across them, or both.

## Source weights from registry settings

`pillarWeightSettingKey(pillarId)` composes the canonical key
`search.pillarWeights.<pillarId>`, but nothing in the running system reads or
writes it: no pillar advertises the key, the registry settings surface does not
declare it, and the orchestrator resolves no weights. The "operator boosts or
suppresses a pillar by setting a weight" story is inert.

Build the end-to-end path: declare the `search.pillarWeights.*` keys on the
owning settings surface, read them into a `PillarWeights` map at query time
(keyed via `pillarWeightSettingKey`), and pass that map into the merge. Surface
the merge's misconfig warnings (negative / non-finite weights) through the
orchestrator's warn sink so a bad weight is observable rather than silently
clamped.
