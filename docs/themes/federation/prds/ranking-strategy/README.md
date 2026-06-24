# Ranking strategy

> Theme: [Federation](../../README.md)

## Overview

The cross-pillar merge algorithm for federated search. Each pillar returns its
own already-scored hit list on its scale; `mergeResults` normalises every
pillar's scores per query, applies an optional per-pillar weight, and produces a
single ranked list. It is a **pure function** — no I/O, no settings reads, no
logger — so it can be unit-tested exhaustively and called from anywhere.

The strategy is **weighted-sum**: normalise to `[0, 1]` per pillar, multiply by
the pillar's weight (default `1.0`), sort descending. Per-pillar normalisation is
the load-bearing choice: a pillar returning 100 hits cannot drown out a pillar
returning one, because each pillar's top hit is rescaled to `1.0` before
weighting.

The merge primitives ship in `@pops/pillar-sdk/ranking` and are consumed by the
SDK's federated-search runner (`runFederatedSearch`, see
[Federated query orchestrator](../federated-query-orchestrator/README.md)). The
runner sources weights from the caller and forwards them into `mergeResults`.

> The live orchestrator pillar (`:3009`) does **not** yet route its HTTP
> `/search` through this weighted-sum merge, and no pillar weight is wired from
> registry settings end-to-end. The shipped runtime path uses a plain
> per-section score sort with context-first ordering. The pure merge + settings
> key helper below are built and tested; the live wiring is tracked in
> [docs/ideas/ranking-strategy.md](../../../../ideas/ranking-strategy.md).

## Data model

No persisted state of its own. Weights are intended to live in the registry
settings store under the key:

| Key                               | Type   | Default | Meaning                          |
| --------------------------------- | ------ | ------- | -------------------------------- |
| `search.pillarWeights.<pillarId>` | number | `1.0`   | Per-pillar relevance multiplier. |

`pillarWeightSettingKey(pillarId)` composes this key from the
`SETTINGS_KEY_PREFIX` constant (`search.pillarWeights.`) so the runner and any
admin tooling share one definition and cannot drift. The merge function itself
never reads settings — the caller resolves the `PillarWeights` map and passes it
in.

## API surface

Exported from `@pops/pillar-sdk/ranking`:

```ts
export const DEFAULT_PILLAR_WEIGHT = 1.0;
export const SETTINGS_KEY_PREFIX = 'search.pillarWeights.';

export function pillarWeightSettingKey(pillarId: string): string;

export type PillarWeights = ReadonlyMap<string, number>;

export interface ScoredResult {
  readonly score: number; // raw, pillar-defined scale
  readonly entityName: string; // stable name; all-zero tie-breaker
  readonly data: unknown; // opaque payload, forwarded untouched
}

export interface MergedResult extends ScoredResult {
  readonly pillarId: string; // matches an input map key
  readonly adjustedScore: number; // normalised score * weight, in [0, weight]
}

export interface MergeOptions {
  readonly limit?: number;
  readonly weights?: PillarWeights;
  readonly onWarn?: (message: string) => void;
}

export function mergeResults(
  perPillarResults: ReadonlyMap<string, readonly ScoredResult[]>,
  options?: MergeOptions
): MergedResult[];
```

The input is a `ReadonlyMap`, not a plain object, because **insertion order is
the adapter-priority tie-breaker** (see
[Search adapter manifest](../search-adapter-manifest/README.md)). Callers
building the map must preserve registry order.

### Algorithm

1. For each pillar, find its max finite score. Normalise every hit to
   `score / max` (clamped at `0`; a non-positive max yields `0` for all hits).
2. Multiply the normalised score by the pillar's weight
   (`weights.get(pillarId) ?? DEFAULT_PILLAR_WEIGHT`).
3. Sort descending by `adjustedScore`. Break ties by pillar insertion order
   (adapter priority).
4. If **every** adjusted score is `0`, fall back to a locale-independent
   code-point comparison on `entityName`, then by pillar order. Determinism
   matters — relying on the host locale would reorder results across
   environments.
5. Apply `limit` if provided (clamped to a non-negative integer).

Raw `score` is preserved on each `MergedResult`; `adjustedScore` is carried
separately for transparency (debugging, UI tooltips).

## Business rules

- **Default weight is `1.0` for every pillar.** A pillar absent from the weights
  map gets the default. Operators tune by setting `search.pillarWeights.<id>`.
- **Normalisation is per-query, per-pillar — never absolute.** Prevents one
  pillar dominating purely by returning more hits.
- **Ties break by pillar adapter priority** (input-map insertion order).
- **Weights are intended to be runtime-tunable** via registry settings; the pure
  merge stays settings-agnostic and receives the resolved map.
- **`mergeResults` performs no I/O.** No default logger — `onWarn` defaults to a
  no-op sink, so the function is pure. Callers that want misconfig warnings
  inject their own sink.

## Edge cases

| Case                                              | Behaviour                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| One pillar returns 0 results                      | Empty contribution; does not affect the merge.                                         |
| All results have score 0                          | Sorted by locale-independent code-point comparison on `entityName`, then pillar order. |
| Negative weight                                   | Treated as `0`; warning emitted via `onWarn`.                                          |
| Non-finite weight (`NaN`, `±Infinity`)            | Treated as `DEFAULT_PILLAR_WEIGHT`; warning emitted via `onWarn`.                      |
| Non-finite adapter score                          | Treated as `0` during normalisation; never produces a `NaN` adjusted score.            |
| Pillar whose hits are all the same non-zero score | All normalise to `1.0`.                                                                |
| Negative or non-finite `limit`                    | Treated as `0` (no `slice(0, -1)` "all but last" surprise).                            |
| Fractional `limit`                                | Floored.                                                                               |

## Acceptance criteria

All criteria below are covered by the Vitest suite alongside the merge
implementation in `@pops/pillar-sdk/ranking`.

Merge core

- [x] Normalises each pillar's scores per query so a 100-result pillar cannot dominate a 1-result pillar.
- [x] Multiplies normalised scores by the per-pillar weight; missing weights default to `1.0`.
- [x] Sorts descending by adjusted score.
- [x] Breaks equal-score ties by pillar insertion order (adapter priority).
- [x] Preserves the raw `score` on each result while exposing `adjustedScore` separately.
- [x] Forwards opaque `data` payloads untouched.
- [x] Returns an empty list when every pillar is empty.
- [x] Ignores an empty pillar without affecting the rest of the merge.
- [x] Normalises a pillar whose hits share one non-zero score to all-`1.0`.

All-zero fallback

- [x] Falls back to an alphabetical `entityName` comparison when every adjusted score is `0`.
- [x] Breaks alphabetical ties in the fallback by pillar order.
- [x] The fallback ordering is deterministic regardless of host locale (code-point comparison).

Weight misconfig

- [x] Clamps a negative weight to `0` and emits a warning via `onWarn`.
- [x] Falls back to the default weight for a `NaN` weight and warns.
- [x] Falls back to the default weight for an `Infinity` weight and warns, never producing a non-finite score.
- [x] Treats a non-finite adapter score as `0` instead of producing `NaN`.
- [x] Does not invoke a default warning sink — `mergeResults` stays pure when no `onWarn` is supplied.

Limit

- [x] Honours a positive `limit`.
- [x] Returns an empty list for a negative `limit` (no `slice(0, -1)` surprise).
- [x] Returns an empty list for a non-finite `limit`.
- [x] Floors a fractional `limit`.

Settings key

- [x] `pillarWeightSettingKey(id)` composes `search.pillarWeights.<id>` from `SETTINGS_KEY_PREFIX`.

The criteria are encoded as tests rather than prose: this PRD is a single
buildable unit, so the user-story split would be ceremony with no audit value.

## Not built

The pure merge ships and is tested, but is not wired into the live runtime. See
[docs/ideas/ranking-strategy.md](../../../../ideas/ranking-strategy.md):

- **Live wiring into the orchestrator HTTP surface.** The orchestrator pillar's
  `POST /search` runs a plain per-section score sort with context-first
  ordering; it never calls `mergeResults`. Cross-pillar weighted ranking has no
  effect on the shipped search endpoint.
- **Weights sourced from registry settings.** No pillar advertises
  `search.pillarWeights.*`, no registry settings surface declares it, and
  nothing reads it. The "operator boost/suppress via settings" behaviour is not
  live end-to-end.

## Out of scope

- Learned ranking (ML / click-through optimisation).
- Per-user weight personalisation.
- Cross-pillar query reformulation.
