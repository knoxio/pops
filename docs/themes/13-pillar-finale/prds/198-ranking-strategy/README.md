# PRD-198: Ranking strategy

> Epic: [Search registry](../../epics/06-search-registry.md)

## Overview

The merge algorithm for cross-pillar search results. Initial strategy: weighted-sum with per-pillar weights from `core.db.settings`. Each pillar returns scored results; orchestrator normalises and merges.

## Data Model

Settings table extension:

- `search.pillarWeights.<pillar>` → number (default 1.0)

## API Surface

```ts
function mergeResults(perPillarResults: Map<string, ScoredResult[]>): ScoredResult[];
```

Algorithm:

1. Normalise each pillar's scores to [0, 1] (divide by max).
2. Multiply by `pillarWeight[pillar]`.
3. Sort descending by adjusted score.
4. Return top-N.

## Business Rules

- **Default weight is 1.0 for every pillar.** Operator can boost / suppress via settings.
- **Normalisation is per-query, not absolute.** Avoids one chunk dominating because it returned 100 results.
- **Ties broken by pillar adapter priority (PRD-196).**
- **Weights are runtime-tunable** via `core.settings.set`.

## Edge Cases

| Case                         | Behaviour                                         |
| ---------------------------- | ------------------------------------------------- |
| One pillar returns 0 results | Empty contribution; doesn't affect merge.         |
| All results have score 0     | Sorted alphabetically by entity name as fallback. |
| Negative weight              | Treated as 0; logged as misconfig.                |

## User Stories

| #   | Story                                             | Summary                                      |
| --- | ------------------------------------------------- | -------------------------------------------- |
| 01  | [us-01-merge-impl](us-01-merge-impl.md)           | The weighted-sum merge function              |
| 02  | [us-02-settings-tuning](us-02-settings-tuning.md) | Settings key for per-pillar weights          |
| 03  | [us-03-tests](us-03-tests.md)                     | Merge tests with various score distributions |

## Out of Scope

- Learned ranking (ML / click-through optimisation).
- Per-user weight personalisation.
- Cross-pillar query reformulation.
