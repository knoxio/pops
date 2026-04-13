import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PreferenceProfile, ShelfDefinition, ShelfInstance } from './types.js';

// Mock registry and impressions service before imports
vi.mock('./registry.js', () => ({
  getRegisteredShelves: vi.fn(),
}));

vi.mock('./impressions.service.js', () => ({
  getShelfFreshness: vi.fn().mockReturnValue(1.0),
}));

import { getShelfFreshness } from './impressions.service.js';
import { getRegisteredShelves } from './registry.js';
import { assembleSession } from './session.service.js';

const mockGetRegisteredShelves = vi.mocked(getRegisteredShelves);
const mockGetShelfFreshness = vi.mocked(getShelfFreshness);

/** Minimal PreferenceProfile for tests. */
const profile: PreferenceProfile = {
  genreAffinities: [],
  dimensionWeights: [],
  genreDistribution: [],
  totalMoviesWatched: 10,
  totalComparisons: 20,
};

/** Build a ShelfInstance with given overrides. */
function makeInstance(
  shelfId: string,
  score = 0.8,
  overrides: Partial<ShelfInstance> = {}
): ShelfInstance {
  return {
    shelfId,
    title: `Title: ${shelfId}`,
    query: async () => [],
    score,
    ...overrides,
  };
}

/** Build a ShelfDefinition that generates the given instances. */
function makeDefinition(
  id: string,
  category: ShelfDefinition['category'],
  instances: ShelfInstance[],
  template = false
): ShelfDefinition {
  return {
    id,
    template,
    category,
    generate: () => instances,
  };
}

describe('assembleSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetShelfFreshness.mockReturnValue(1.0);
  });

  it('returns empty array when no shelves are registered', () => {
    mockGetRegisteredShelves.mockReturnValue([]);
    const result = assembleSession(profile, new Map());
    expect(result).toHaveLength(0);
  });

  it('returns all instances when fewer than 10 are available', () => {
    const instances = [
      makeInstance('trending', 0.9),
      makeInstance('new-releases', 0.8),
      makeInstance('because-you-watched:1', 0.7),
    ];
    mockGetRegisteredShelves.mockReturnValue([
      makeDefinition('trending', 'tmdb', [instances[0]!]),
      makeDefinition('new-releases', 'tmdb', [instances[1]!]),
      makeDefinition('because-you-watched', 'seed', [instances[2]!]),
    ]);

    const result = assembleSession(profile, new Map());
    expect(result.length).toBeLessThanOrEqual(3);
    // All instances should be included since there are fewer than 10
    const ids = result.map((s) => s.shelfId);
    expect(ids).toContain('trending');
    expect(ids).toContain('new-releases');
    expect(ids).toContain('because-you-watched:1');
  });

  it('returns between 10 and 15 instances when enough are available', () => {
    const definitions = Array.from({ length: 20 }, (_, i) =>
      makeDefinition(`shelf-${i}`, 'tmdb', [makeInstance(`shelf-${i}`, 0.8)])
    );
    mockGetRegisteredShelves.mockReturnValue(definitions);

    const result = assembleSession(profile, new Map());
    expect(result.length).toBeGreaterThanOrEqual(10);
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it('enforces max 3 seed-based shelves', () => {
    // Register 6 seed shelves + 10 tmdb shelves
    const seedDefs = Array.from({ length: 6 }, (_, i) =>
      makeDefinition(`because-you-watched:${i}`, 'seed', [
        makeInstance(`because-you-watched:${i}`, 0.9),
      ])
    );
    const tmdbDefs = Array.from({ length: 10 }, (_, i) =>
      makeDefinition(`tmdb-${i}`, 'tmdb', [makeInstance(`tmdb-${i}`, 0.8)])
    );
    mockGetRegisteredShelves.mockReturnValue([...seedDefs, ...tmdbDefs]);

    const result = assembleSession(profile, new Map());
    const seedCount = result.filter((s) => s.shelfId.startsWith('because-you-watched')).length;
    expect(seedCount).toBeLessThanOrEqual(3);
  });

  it('enforces max 2 genre shelves (best-in-genre or genre-crossover)', () => {
    // Register 4 genre shelves + 12 tmdb shelves
    const genreDefs = [
      makeDefinition('best-in-genre-action', 'seed', [makeInstance('best-in-genre-action', 0.9)]),
      makeDefinition('best-in-genre-drama', 'seed', [makeInstance('best-in-genre-drama', 0.9)]),
      makeDefinition('genre-crossover-scifi', 'seed', [makeInstance('genre-crossover-scifi', 0.9)]),
      makeDefinition('genre-crossover-thriller', 'seed', [
        makeInstance('genre-crossover-thriller', 0.9),
      ]),
    ];
    const tmdbDefs = Array.from({ length: 12 }, (_, i) =>
      makeDefinition(`tmdb-${i}`, 'tmdb', [makeInstance(`tmdb-${i}`, 0.8)])
    );
    mockGetRegisteredShelves.mockReturnValue([...genreDefs, ...tmdbDefs]);

    const result = assembleSession(profile, new Map());
    const genreCount = result.filter(
      (s) => s.shelfId.startsWith('best-in-genre') || s.shelfId.startsWith('genre-crossover')
    ).length;
    expect(genreCount).toBeLessThanOrEqual(2);
  });

  it('enforces max 1 local shelf per window of 3', () => {
    // Register 5 local shelves + 10 tmdb shelves
    const localDefs = Array.from({ length: 5 }, (_, i) =>
      makeDefinition(`local-${i}`, 'local', [makeInstance(`local-${i}`, 0.9)])
    );
    const tmdbDefs = Array.from({ length: 10 }, (_, i) =>
      makeDefinition(`tmdb-${i}`, 'tmdb', [makeInstance(`tmdb-${i}`, 0.7)])
    );
    mockGetRegisteredShelves.mockReturnValue([...localDefs, ...tmdbDefs]);

    const result = assembleSession(profile, new Map());
    // Check that no 3-consecutive window has more than 1 local shelf
    for (let i = 0; i <= result.length - 3; i++) {
      const window = result.slice(i, i + 3);
      // We'd need the category per shelfId, but since local- prefix = local category
      const localInWindow = window.filter((s) => s.shelfId.startsWith('local-')).length;
      expect(localInWindow).toBeLessThanOrEqual(1);
    }
  });

  it('guarantees at least 1 personal shelf (because-you-watched or recommendations)', () => {
    // Register only tmdb shelves + 1 personal shelf
    const tmdbDefs = Array.from({ length: 20 }, (_, i) =>
      makeDefinition(`tmdb-${i}`, 'tmdb', [makeInstance(`tmdb-${i}`, 0.9)])
    );
    const personalDef = makeDefinition('because-you-watched', 'seed', [
      makeInstance('because-you-watched:42', 0.1), // low score — shouldn't be naturally selected
    ]);
    mockGetRegisteredShelves.mockReturnValue([...tmdbDefs, personalDef]);

    const result = assembleSession(profile, new Map());
    const hasPersonal = result.some(
      (s) => s.shelfId.startsWith('because-you-watched') || s.shelfId.startsWith('recommendations')
    );
    expect(hasPersonal).toBe(true);
  });

  it('calls getShelfFreshness for every candidate instance', () => {
    mockGetShelfFreshness.mockReturnValue(1.0);
    const impressions = new Map([
      ['shelf-1', 3],
      ['shelf-3', 7],
    ]);

    const defs = Array.from({ length: 5 }, (_, i) =>
      makeDefinition(`shelf-${i}`, 'tmdb', [makeInstance(`shelf-${i}`, 0.8)])
    );
    mockGetRegisteredShelves.mockReturnValue(defs);

    assembleSession(profile, impressions);

    // getShelfFreshness should be called once per candidate (5 candidates)
    expect(mockGetShelfFreshness).toHaveBeenCalledTimes(5);
    // Impression counts are correctly passed
    expect(mockGetShelfFreshness).toHaveBeenCalledWith(3); // shelf-1
    expect(mockGetShelfFreshness).toHaveBeenCalledWith(7); // shelf-3
    expect(mockGetShelfFreshness).toHaveBeenCalledWith(0); // shelf-0, shelf-2, shelf-4
  });

  it('passes impression count to getShelfFreshness', () => {
    const impressions = new Map([['trending', 3]]);
    mockGetRegisteredShelves.mockReturnValue([
      makeDefinition('trending', 'tmdb', [makeInstance('trending', 0.8)]),
    ]);

    assembleSession(profile, impressions);
    expect(mockGetShelfFreshness).toHaveBeenCalledWith(3);
  });

  it('passes 0 to getShelfFreshness when shelf has no impressions', () => {
    const impressions = new Map<string, number>();
    mockGetRegisteredShelves.mockReturnValue([
      makeDefinition('trending', 'tmdb', [makeInstance('trending', 0.8)]),
    ]);

    assembleSession(profile, impressions);
    expect(mockGetShelfFreshness).toHaveBeenCalledWith(0);
  });

  it('applies +0.3 context boost — context shelves outscore equal tmdb shelves', () => {
    // Context shelf with base score 0.5, tmdb shelf also 0.5 — context should win
    const contextDef = makeDefinition('context', 'context', [makeInstance('context:morning', 0.5)]);
    // Register enough tmdb shelves to fill a session
    const tmdbDefs = Array.from({ length: 15 }, (_, i) =>
      makeDefinition(`tmdb-${i}`, 'tmdb', [makeInstance(`tmdb-${i}`, 0.5)])
    );
    mockGetRegisteredShelves.mockReturnValue([contextDef, ...tmdbDefs]);

    // Run many times — context shelf should consistently appear in results
    let contextCount = 0;
    for (let i = 0; i < 20; i++) {
      const result = assembleSession(profile, new Map());
      if (result.some((s) => s.shelfId === 'context:morning')) contextCount++;
    }
    // With +0.3 boost over equal-scored competitors, context shelf appears far more often
    expect(contextCount).toBeGreaterThanOrEqual(15);
  });

  it('does not include duplicate shelf IDs in result', () => {
    const definitions = Array.from({ length: 15 }, (_, i) =>
      makeDefinition(`shelf-${i}`, 'tmdb', [makeInstance(`shelf-${i}`, 0.8)])
    );
    mockGetRegisteredShelves.mockReturnValue(definitions);

    const result = assembleSession(profile, new Map());
    const ids = result.map((s) => s.shelfId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
