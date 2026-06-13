/**
 * Cross-pillar ranking merge (PRD-198).
 *
 * Given per-pillar `ScoredResult[]` lists, produces a single ranked list:
 *
 *  1. Normalise each pillar's scores to `[0, 1]` (divide by that pillar's max).
 *  2. Multiply by `weights.get(pillarId) ?? DEFAULT_PILLAR_WEIGHT`.
 *  3. Sort descending by adjusted score.
 *  4. Break ties by the pillar's position in the input map (PRD-196 adapter
 *     priority is encoded by insertion order).
 *  5. If every adjusted score is 0, fall back to alphabetical order by
 *     `entityName` (PRD-198 "all results have score 0" edge case).
 *
 * Pure function — no I/O, no settings reads. Callers (orchestrator in
 * PRD-197) are responsible for sourcing weights from `core.db.settings`.
 */

import type { MergedResult, MergeOptions, PillarWeights, ScoredResult } from './types.js';

export const DEFAULT_PILLAR_WEIGHT = 1.0;

/** Settings key prefix; consumers compose `${SETTINGS_KEY_PREFIX}${pillarId}`. */
export const SETTINGS_KEY_PREFIX = 'search.pillarWeights.';

/**
 * Compose the `core.db.settings` key that carries the weight for a given
 * pillar. Centralised so the orchestrator and admin tooling cannot drift.
 */
export function pillarWeightSettingKey(pillarId: string): string {
  return `${SETTINGS_KEY_PREFIX}${pillarId}`;
}

interface AnnotatedResult {
  readonly pillarId: string;
  readonly pillarIndex: number;
  readonly original: ScoredResult;
  readonly adjustedScore: number;
}

function resolveWeight(
  pillarId: string,
  weights: PillarWeights | undefined,
  onWarn: (message: string) => void
): number {
  const raw = weights?.get(pillarId) ?? DEFAULT_PILLAR_WEIGHT;
  if (raw < 0) {
    onWarn(`[ranking] Negative weight ${raw} for pillar "${pillarId}" treated as 0 (misconfig).`);
    return 0;
  }
  return raw;
}

/**
 * Merge per-pillar scored results into a single ranked list.
 *
 * The input is a `Map` (not a plain object) because insertion order doubles
 * as the adapter-priority tiebreaker (PRD-196). Callers building the map from
 * an object should preserve registry order.
 */
export function mergeResults(
  perPillarResults: ReadonlyMap<string, readonly ScoredResult[]>,
  options: MergeOptions = {}
): MergedResult[] {
  const { limit, weights, onWarn = console.warn } = options;

  const annotated: AnnotatedResult[] = [];
  let pillarIndex = 0;

  for (const [pillarId, results] of perPillarResults) {
    const currentIndex = pillarIndex++;
    if (results.length === 0) continue;

    const weight = resolveWeight(pillarId, weights, onWarn);
    const maxScore = results.reduce(
      (acc, r) => (r.score > acc ? r.score : acc),
      Number.NEGATIVE_INFINITY
    );

    for (const result of results) {
      const normalised = maxScore > 0 ? result.score / maxScore : 0;
      annotated.push({
        pillarId,
        pillarIndex: currentIndex,
        original: result,
        adjustedScore: normalised * weight,
      });
    }
  }

  const allZero = annotated.every((a) => a.adjustedScore === 0);

  annotated.sort((a, b) => {
    if (allZero) {
      const nameCompare = a.original.entityName.localeCompare(b.original.entityName);
      if (nameCompare !== 0) return nameCompare;
      return a.pillarIndex - b.pillarIndex;
    }

    if (a.adjustedScore !== b.adjustedScore) {
      return b.adjustedScore - a.adjustedScore;
    }
    return a.pillarIndex - b.pillarIndex;
  });

  const sliced = limit !== undefined ? annotated.slice(0, limit) : annotated;

  return sliced.map((a) => ({
    pillarId: a.pillarId,
    score: a.original.score,
    entityName: a.original.entityName,
    data: a.original.data,
    adjustedScore: a.adjustedScore,
  }));
}
