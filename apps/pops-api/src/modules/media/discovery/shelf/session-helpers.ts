/**
 * Session assembly helpers — scoring, weighted sampling, and shelf predicates.
 */
import type { ShelfCategory, ShelfInstance } from './types.js';

const VARIETY_BONUS = 0.2;
const CONTEXT_BOOST = 0.3;

export interface ScoredCandidate {
  instance: ShelfInstance;
  category: ShelfCategory;
  baseScore: number;
}

export function isGenreShelf(shelfId: string): boolean {
  return shelfId.startsWith('best-in-genre') || shelfId.startsWith('genre-crossover');
}

export function isPersonalShelf(shelfId: string): boolean {
  return shelfId.startsWith('recommendations') || shelfId.startsWith('because-you-watched');
}

/** Compute score applying variety bonus and context boost. */
export function computeScore(
  candidate: ScoredCandidate,
  lastCategory: ShelfCategory | null
): number {
  const varietyBonus =
    lastCategory !== null && candidate.category !== lastCategory ? VARIETY_BONUS : 0;
  const contextBonus = candidate.category === 'context' ? CONTEXT_BOOST : 0;
  return candidate.baseScore * (1 + varietyBonus + contextBonus);
}

/** Weighted random sample from candidates proportional to their scores. */
export function weightedSample(candidates: ScoredCandidate[], scores: number[]): ScoredCandidate {
  const total = scores.reduce((s, v) => s + v, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    rand -= scores[i] ?? 0;
    if (rand <= 0) {
      const candidate = candidates[i];
      if (candidate) return candidate;
    }
  }
  const fallback = candidates.at(-1);
  if (!fallback) throw new Error('weightedSample requires non-empty candidates array');
  return fallback;
}
