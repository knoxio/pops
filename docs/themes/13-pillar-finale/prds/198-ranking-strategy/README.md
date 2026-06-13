# PRD-198: Ranking strategy

> Epic: [Search registry](../../epics/06-search-registry.md)

## Overview

The merge algorithm for cross-pillar search results. Initial strategy: weighted-sum with per-pillar weights from `core.db.settings`. Each pillar returns scored results; orchestrator normalises and merges.

## Data Model

Settings table extension:

- `search.pillarWeights.<pillar>` → number (default 1.0)

## API Surface

Exported from `@pops/pillar-sdk/ranking`:

```ts
export const DEFAULT_PILLAR_WEIGHT = 1.0;
export const SETTINGS_KEY_PREFIX = 'search.pillarWeights.';

export function pillarWeightSettingKey(pillarId: string): string;

export type PillarWeights = ReadonlyMap<string, number>;

export interface ScoredResult {
  readonly score: number;
  readonly entityName: string;
  readonly data: unknown;
}

export interface MergedResult extends ScoredResult {
  readonly pillarId: string;
  readonly adjustedScore: number;
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

Algorithm:

1. Normalise each pillar's scores to `[0, 1]` (divide by that pillar's max; non-finite scores treated as 0).
2. Multiply by `weights.get(pillarId) ?? DEFAULT_PILLAR_WEIGHT`.
3. Sort descending by adjusted score, breaking ties by pillar insertion order (adapter priority, PRD-196).
4. If every adjusted score is 0, fall back to a locale-independent code-point comparison on `entityName`.
5. Apply `limit` (clamped to non-negative integer) if provided.

`pillarWeightSettingKey(pillarId)` composes the canonical `core.db.settings` key (`search.pillarWeights.<pillarId>`) so the orchestrator and admin tooling cannot drift.

`mergeResults` is a pure function — no I/O, no settings reads, no default logger. The orchestrator (PRD-197) sources weights from `core.db.settings` and supplies `onWarn` if it wants misconfig warnings surfaced.

## Business Rules

- **Default weight is 1.0 for every pillar.** Operator can boost / suppress via settings.
- **Normalisation is per-query, not absolute.** Avoids one chunk dominating because it returned 100 results.
- **Ties broken by pillar adapter priority (PRD-196).**
- **Weights are runtime-tunable** via `core.settings.set`.

## Edge Cases

| Case                              | Behaviour                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------- |
| One pillar returns 0 results      | Empty contribution; doesn't affect merge.                                       |
| All results have score 0          | Sorted by locale-independent code-point comparison on `entityName` as fallback. |
| Negative weight                   | Treated as 0; warning emitted via `onWarn`.                                     |
| Non-finite weight (`NaN`, `±Inf`) | Treated as `DEFAULT_PILLAR_WEIGHT`; warning emitted via `onWarn`.               |
| Non-finite adapter score          | Treated as 0 during normalisation; never produces `NaN` adjusted scores.        |
| Negative or non-finite `limit`    | Treated as 0 (no `slice(0, -1)` surprise); fractional limits are floored.       |

## User Stories

| #   | Story                                        | Summary                                                                                  | Status |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| 01  | Merge implementation                         | Weighted-sum merge function with per-pillar normalisation                                | Done   |
| 02  | Settings key for per-pillar weights          | `pillarWeightSettingKey` helper + `SETTINGS_KEY_PREFIX` constant for `core.db.settings`  | Done   |
| 03  | Merge tests with various score distributions | Vitest suite covering normalisation, weights, ties, all-zero fallback, limits, misconfig | Done   |

Each story above is implemented and covered by the test suite in `packages/pillar-sdk/src/ranking/__tests__/merge.test.ts`. The PRD is scoped tightly enough that splitting each story into its own doc would be ceremony with no audit value — the acceptance criteria are encoded as tests, not prose.

Shipped in `@pops/pillar-sdk/ranking` (`mergeResults`, `pillarWeightSettingKey`). Consumed by the federated orchestrator (PRD-197) once it lands.

## Out of Scope

- Learned ranking (ML / click-through optimisation).
- Per-user weight personalisation.
- Cross-pillar query reformulation.
