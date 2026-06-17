/**
 * Session assembly — selects an ordered set of shelf instances for a single
 * discover session via relevance × freshness scoring, variety bonuses, and
 * category constraints (seed / genre / local-window caps).
 *
 * Ported from the monolith `shelf/session.service.ts`. Shelf generation takes
 * the injected deps; freshness comes from `shelfImpressionsService`.
 */
import { shelfImpressionsService, type PreferenceProfile } from '../../../../db/index.js';
import {
  getMaxGenreShelves,
  getMaxSeedShelves,
  getSessionTargetMax,
  getSessionTargetMin,
} from '../config.js';
import { getRegisteredShelves } from './registry.js';
import { computeScore, isGenreShelf, isPersonalShelf, weightedSample } from './session-helpers.js';

import type { DiscoveryDeps } from '../deps.js';
import type { ScoredCandidate } from './session-helpers.js';
import type { ShelfCategory, ShelfInstance } from './types.js';

const LOCAL_WINDOW_SIZE = 3;
const MAX_LOCAL_PER_WINDOW = 1;

interface CategorisedCandidates {
  pinnedInstances: ShelfInstance[];
  allCandidates: ScoredCandidate[];
}

function categoriseCandidates(
  deps: DiscoveryDeps,
  profile: PreferenceProfile,
  impressions: Map<string, number>
): CategorisedCandidates {
  const pinnedInstances: ShelfInstance[] = [];
  const allCandidates: ScoredCandidate[] = [];
  for (const def of getRegisteredShelves()) {
    const instances = def.generate({ deps, profile });
    if (def.pinned) {
      pinnedInstances.push(...instances.map((inst) => ({ ...inst, pinned: true as const })));
      continue;
    }
    for (const instance of instances) {
      const count = impressions.get(instance.shelfId) ?? 0;
      const freshness = shelfImpressionsService.getShelfFreshness(count);
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
    const c = allCandidates.find((cand) => cand.instance.shelfId === s.shelfId);
    return c?.category === 'local';
  }).length;
}

function pickEligible(state: AssemblyState, localInWindow: number): ScoredCandidate[] {
  return state.remaining.filter((c) => {
    if (c.category === 'seed' && state.seedCount >= getMaxSeedShelves()) return false;
    if (isGenreShelf(c.instance.shelfId) && state.genreCount >= getMaxGenreShelves()) return false;
    if (c.category === 'local' && localInWindow >= MAX_LOCAL_PER_WINDOW) return false;
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
 * @returns ordered list of ~10–15 shelf instances (pinned first).
 */
export function assembleSession(
  deps: DiscoveryDeps,
  profile: PreferenceProfile,
  impressions: Map<string, number>
): ShelfInstance[] {
  const { pinnedInstances, allCandidates } = categoriseCandidates(deps, profile, impressions);
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

/**
 * Resolve a single shelf instance by its shelfId (for paging). Static shelves
 * use the definition id; template shelves append `:seedKey`. Returns null when
 * the definition or instance can't be found.
 */
export function resolveShelfInstance(
  deps: DiscoveryDeps,
  profile: PreferenceProfile,
  shelfId: string
): ShelfInstance | null {
  const defId = shelfId.includes(':') ? (shelfId.split(':')[0] ?? shelfId) : shelfId;
  const definition = getRegisteredShelves().find((d) => d.id === defId);
  if (!definition) return null;
  return definition.generate({ deps, profile }).find((i) => i.shelfId === shelfId) ?? null;
}
