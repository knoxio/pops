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
 * Pinned shelves (PRD-072):
 *   - Definitions with `pinned: true` are always included when they generate results.
 *   - Pinned instances are prepended to the session before random assembly begins.
 *   - They are excluded from variety constraints (MAX_LOCAL_PER_WINDOW, etc.).
 *   - The random-selection target is reduced by the pinned count so the total
 *     session size stays within SESSION_TARGET_MAX.
 *   - Each pinned instance has `pinned: true` on the returned ShelfInstance so
 *     callers (e.g. the router) can apply a lower minimum-items threshold (≥ 1)
 *     instead of the normal ≥ 3 for regular shelves.
 *
 * Scoring:
 *   score = instance.score × freshness × (1 + varietyBonus + contextBonus)
 *   varietyBonus = 0.2 if category !== previous selected category, else 0
 *   contextBonus = 0.3 if category === 'context' (time-triggered shelves), else 0
 */
import { SETTINGS_KEYS } from '@pops/types';

import { resolveNumber } from '../../../core/settings/index.js';
import { getShelfFreshness } from './impressions.service.js';
import { getRegisteredShelves } from './registry.js';

import type { PreferenceProfile, ShelfCategory, ShelfInstance } from './types.js';

const getSessionTargetMin = (): number =>
  resolveNumber(SETTINGS_KEYS.DISCOVERY_SESSION_TARGET_MIN, 10);
const getSessionTargetMax = (): number =>
  resolveNumber(SETTINGS_KEYS.DISCOVERY_SESSION_TARGET_MAX, 15);
const getMaxSeedShelves = (): number =>
  resolveNumber(SETTINGS_KEYS.DISCOVERY_MAX_SEED_SHELVES, 3);
const getMaxGenreShelves = (): number =>
  resolveNumber(SETTINGS_KEYS.DISCOVERY_MAX_GENRE_SHELVES, 2);
const getMaxLocalPerWindow = (): number =>
  resolveNumber(SETTINGS_KEYS.DISCOVERY_MAX_LOCAL_PER_WINDOW, 1);
const LOCAL_WINDOW_SIZE = 3;
const VARIETY_BONUS = 0.2;
const CONTEXT_BOOST = 0.3;

function isGenreShelf(shelfId: string): boolean {
  return shelfId.startsWith('best-in-genre') || shelfId.startsWith('genre-crossover');
}

function isPersonalShelf(shelfId: string): boolean {
  return shelfId.startsWith('recommendations') || shelfId.startsWith('because-you-watched');
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
  const contextBonus = candidate.category === 'context' ? CONTEXT_BOOST : 0;
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
  if (!fallback) throw new Error('weightedSample requires non-empty candidates array');
  return fallback;
}

interface CategorisedCandidates {
  pinnedInstances: ShelfInstance[];
  allCandidates: ScoredCandidate[];
}

function categoriseCandidates(
  profile: PreferenceProfile,
  impressions: Map<string, number>
): CategorisedCandidates {
  const definitions = getRegisteredShelves();
  const pinnedInstances: ShelfInstance[] = [];
  const allCandidates: ScoredCandidate[] = [];

  for (const def of definitions) {
    const instances = def.generate(profile);
    if (def.pinned) {
      pinnedInstances.push(...instances.map((inst) => ({ ...inst, pinned: true as const })));
      continue;
    }
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
  return { pinnedInstances, allCandidates };
}

interface AssemblyState {
  selected: ShelfInstance[];
  remaining: ScoredCandidate[];
  seedCount: number;
  genreCount: number;
  lastCategory: ShelfCategory | null;
}

function localCountInWindow(state: AssemblyState, allCandidates: ScoredCandidate[]): number {
  return state.selected.slice(-LOCAL_WINDOW_SIZE).filter((s) => {
    const c = allCandidates.find((c) => c.instance.shelfId === s.shelfId);
    return c?.category === 'local';
  }).length;
}

function pickEligible(state: AssemblyState, localInWindow: number): ScoredCandidate[] {
  const maxSeeds = getMaxSeedShelves();
  const maxGenres = getMaxGenreShelves();
  const maxLocal = getMaxLocalPerWindow();
  return state.remaining.filter((c) => {
    if (c.category === 'seed' && state.seedCount >= maxSeeds) return false;
    if (isGenreShelf(c.instance.shelfId) && state.genreCount >= maxGenres) return false;
    if (c.category === 'local' && localInWindow >= maxLocal) return false;
    return true;
  });
}

function selectShelvesRandomly(
  allCandidates: ScoredCandidate[],
  randomTarget: number
): ShelfInstance[] {
  const state: AssemblyState = {
    selected: [],
    remaining: [...allCandidates],
    seedCount: 0,
    genreCount: 0,
    lastCategory: null,
  };

  while (state.selected.length < randomTarget && state.remaining.length > 0) {
    const localInWindow = localCountInWindow(state, allCandidates);
    const eligible = pickEligible(state, localInWindow);
    if (eligible.length === 0) break;
    const scores = eligible.map((c) => Math.max(0.001, computeScore(c, state.lastCategory)));
    const picked = weightedSample(eligible, scores);
    state.selected.push(picked.instance);
    state.remaining.splice(state.remaining.indexOf(picked), 1);
    state.lastCategory = picked.category;
    if (picked.category === 'seed') state.seedCount++;
    if (isGenreShelf(picked.instance.shelfId)) state.genreCount++;
  }

  return state.selected;
}

function ensurePersonalShelf(
  selected: ShelfInstance[],
  allCandidates: ScoredCandidate[]
): ShelfInstance[] {
  if (selected.some((s) => isPersonalShelf(s.shelfId))) return selected;
  const selectedIds = new Set(selected.map((s) => s.shelfId));
  const personalCandidate = allCandidates.find(
    (c) => isPersonalShelf(c.instance.shelfId) && !selectedIds.has(c.instance.shelfId)
  );
  if (!personalCandidate) return selected;
  const result = [...selected];
  if (result.length >= getSessionTargetMin()) {
    result[result.length - 1] = personalCandidate.instance;
  } else {
    result.push(personalCandidate.instance);
  }
  return result;
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
  const { pinnedInstances, allCandidates } = categoriseCandidates(profile, impressions);
  if (pinnedInstances.length === 0 && allCandidates.length === 0) return [];

  const randomTarget = Math.max(
    0,
    Math.min(getSessionTargetMax(), Math.max(getSessionTargetMin(), allCandidates.length)) -
      pinnedInstances.length
  );

  const selected = selectShelvesRandomly(allCandidates, randomTarget);
  const finalSelection = ensurePersonalShelf(selected, allCandidates);
  return [...pinnedInstances, ...finalSelection];
}
