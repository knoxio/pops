import { calculateConfidence } from '../types.js';

import type { CandidateMovie } from './smart-pair-helpers.js';

/** Scored candidate pair. */
export interface ScoredPair {
  movieA: CandidateMovie;
  movieB: CandidateMovie;
  priority: number;
}

/**
 * informationGain(A, B) = 1 / (1 + abs(scoreA - scoreB) / 200) × 1 / (pairCount + 1)
 */
export function informationGain(scoreA: number, scoreB: number, pairCount: number): number {
  return (1 / (1 + Math.abs(scoreA - scoreB) / 200)) * (1 / (pairCount + 1));
}

/**
 * recencyWeight(movie) = 1 / (1 + daysSinceLastWatch / 180)
 */
export function recencyWeight(daysSinceLastWatch: number): number {
  return 1 / (1 + daysSinceLastWatch / 180);
}

/**
 * Weighted random sample from items with weights.
 * Returns the selected item, or null if empty.
 */
export function weightedRandomSample<T>(items: Array<{ item: T; weight: number }>): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total <= 0) {
    const picked = items[Math.floor(Math.random() * items.length)];
    return picked ? picked.item : null;
  }
  let r = Math.random() * total;
  for (const { item, weight } of items) {
    r -= weight;
    if (r <= 0) return item;
  }
  const last = items.at(-1);
  return last ? last.item : null;
}

function scorePair(a: CandidateMovie, b: CandidateMovie, pairCount: number): number {
  const infoGain = informationGain(a.score, b.score, pairCount);
  const recA = recencyWeight(a.daysSinceLastWatch);
  const recB = recencyWeight(b.daysSinceLastWatch);
  const confNeed = Math.max(
    1 - calculateConfidence(a.comparisonCount),
    1 - calculateConfidence(b.comparisonCount)
  );
  const jitter = 0.7 + Math.random() * 0.6;
  return infoGain * recA * recB * a.staleness * b.staleness * confNeed * jitter;
}

export interface BuildScoredPairsArgs {
  candidates: CandidateMovie[];
  cooloffPairs: Set<string>;
  pairCountMap: Map<string, number>;
}

export function buildScoredPairs(args: BuildScoredPairsArgs): ScoredPair[] {
  const { candidates, cooloffPairs, pairCountMap } = args;
  const scoredPairs: ScoredPair[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (!a || !b) continue;
      if (cooloffPairs.has(`${a.id}-${b.id}`)) continue;
      const pairCount = pairCountMap.get(`${a.id}-${b.id}`) ?? 0;
      scoredPairs.push({ movieA: a, movieB: b, priority: scorePair(a, b, pairCount) });
    }
  }
  return scoredPairs;
}
