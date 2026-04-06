/**
 * Session assembly service — selects an ordered set of ShelfInstances for a
 * single discover session using relevance × freshness scoring, variety bonuses,
 * and category constraints.
 *
 * Variety constraints (from PRD-065):
 *   - max 3 shelves with category === 'seed'
 *   - max 2 shelves whose shelfId starts with 'best-in-genre' or 'genre-crossover'
 *   - max 1 'local' shelf per window of 3 shelves
 *   - at least 1 personal shelf (shelfId starts with 'recommendations' or 'because-you-watched')
 *
 * Scoring:
 *   score = instance.score × freshness × (1 + varietyBonus + contextBonus)
 *   varietyBonus = 0.2 if category !== previous selected category, else 0
 *   contextBonus = 0.3 if category === 'context' (time-triggered shelves), else 0
 */
import type { PreferenceProfile, ShelfInstance, ShelfCategory } from "./types.js";
import { getRegisteredShelves } from "./registry.js";
import { getShelfFreshness } from "./impressions.service.js";

const SESSION_TARGET_MIN = 10;
const SESSION_TARGET_MAX = 15;
const MAX_SEED_SHELVES = 3;
const MAX_GENRE_SHELVES = 2;
const MAX_LOCAL_PER_WINDOW = 1;
const LOCAL_WINDOW_SIZE = 3;
const VARIETY_BONUS = 0.2;
const CONTEXT_BOOST = 0.3;

function isGenreShelf(shelfId: string): boolean {
  return shelfId.startsWith("best-in-genre") || shelfId.startsWith("genre-crossover");
}

function isPersonalShelf(shelfId: string): boolean {
  return shelfId.startsWith("recommendations") || shelfId.startsWith("because-you-watched");
}

interface ScoredCandidate {
  instance: ShelfInstance;
  category: ShelfCategory;
  baseScore: number;
}

/** Compute scores for all candidates, applying variety bonus and context boost. */
function computeScore(candidate: ScoredCandidate, lastCategory: ShelfCategory | null): number {
  const varietyBonus =
    lastCategory !== null && candidate.category !== lastCategory ? VARIETY_BONUS : 0;
  const contextBonus = candidate.category === "context" ? CONTEXT_BOOST : 0;
  return candidate.baseScore * (1 + varietyBonus + contextBonus);
}

/** Weighted random sample from candidates proportional to their scores. */
function weightedSample(candidates: ScoredCandidate[], scores: number[]): ScoredCandidate {
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
  if (!fallback) throw new Error("weightedSample requires non-empty candidates array");
  return fallback;
}

/**
 * Assemble a discover session from all registered shelves.
 *
 * @param profile - User preference profile for shelf generation.
 * @param impressions - Map of shelfId → impression count (last 7 days) from impressions service.
 * @returns Ordered list of 10–15 ShelfInstances.
 */
export function assembleSession(
  profile: PreferenceProfile,
  impressions: Map<string, number>
): ShelfInstance[] {
  // Step 1: Generate all candidate instances from registered shelves
  const definitions = getRegisteredShelves();
  const allCandidates: ScoredCandidate[] = [];

  for (const def of definitions) {
    const instances = def.generate(profile);
    for (const instance of instances) {
      const count = impressions.get(instance.shelfId) ?? 0;
      const freshness = getShelfFreshness(count);
      allCandidates.push({
        instance,
        category: def.category,
        baseScore: instance.score * freshness,
      });
    }
  }

  if (allCandidates.length === 0) {
    return [];
  }

  // Step 2: Weighted random sampling with variety constraints
  const selected: ShelfInstance[] = [];
  const remaining = [...allCandidates];
  let seedCount = 0;
  let genreCount = 0;
  let lastCategory: ShelfCategory | null = null;

  const target = Math.min(SESSION_TARGET_MAX, Math.max(SESSION_TARGET_MIN, allCandidates.length));

  while (selected.length < target && remaining.length > 0) {
    // Filter by variety constraints
    const localCountInWindow = selected.slice(-LOCAL_WINDOW_SIZE).filter((s) => {
      const c = allCandidates.find((c) => c.instance.shelfId === s.shelfId);
      return c?.category === "local";
    }).length;

    const eligible = remaining.filter((c) => {
      if (c.category === "seed" && seedCount >= MAX_SEED_SHELVES) return false;
      if (isGenreShelf(c.instance.shelfId) && genreCount >= MAX_GENRE_SHELVES) return false;
      if (c.category === "local" && localCountInWindow >= MAX_LOCAL_PER_WINDOW) return false;
      return true;
    });

    if (eligible.length === 0) break;

    // Compute scores with variety bonus
    const scores = eligible.map((c) => Math.max(0.001, computeScore(c, lastCategory)));

    // Weighted random pick
    const picked = weightedSample(eligible, scores);

    selected.push(picked.instance);
    remaining.splice(remaining.indexOf(picked), 1);
    lastCategory = picked.category;
    if (picked.category === "seed") seedCount++;
    if (isGenreShelf(picked.instance.shelfId)) genreCount++;
  }

  // Step 3: Guarantee at least 1 personal shelf
  const hasPersonal = selected.some((s) => isPersonalShelf(s.shelfId));
  if (!hasPersonal) {
    // Find a personal shelf from the original candidates not already in selected
    const selectedIds = new Set(selected.map((s) => s.shelfId));
    const personalCandidate = allCandidates.find(
      (c) => isPersonalShelf(c.instance.shelfId) && !selectedIds.has(c.instance.shelfId)
    );
    if (personalCandidate) {
      // Replace the last shelf (lowest priority position) with the personal shelf
      if (selected.length >= SESSION_TARGET_MIN) {
        selected[selected.length - 1] = personalCandidate.instance;
      } else {
        selected.push(personalCandidate.instance);
      }
    }
  }

  return selected;
}
