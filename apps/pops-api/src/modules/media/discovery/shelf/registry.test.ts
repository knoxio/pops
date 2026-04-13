import { beforeEach, describe, expect, it } from 'vitest';

import { _clearRegistry, getRegisteredShelves, registerShelf } from './registry.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

const makeInstance = (id: string): ShelfInstance => ({
  shelfId: id,
  title: `Title for ${id}`,
  query: async () => [],
  score: 0.8,
});

const makeDefinition = (id: string, template = false): ShelfDefinition => ({
  id,
  template,
  category: 'tmdb',
  generate: () => [makeInstance(id)],
});

describe('shelf registry', () => {
  beforeEach(() => {
    _clearRegistry();
  });

  it('starts empty', () => {
    expect(getRegisteredShelves()).toHaveLength(0);
  });

  it('registerShelf adds a definition', () => {
    registerShelf(makeDefinition('trending'));
    const shelves = getRegisteredShelves();
    expect(shelves).toHaveLength(1);
    expect(shelves[0]!.id).toBe('trending');
  });

  it('getRegisteredShelves returns all registered definitions', () => {
    registerShelf(makeDefinition('trending'));
    registerShelf(makeDefinition('new-releases'));
    registerShelf(makeDefinition('hidden-gems'));
    const shelves = getRegisteredShelves();
    expect(shelves).toHaveLength(3);
    const ids = shelves.map((s) => s.id);
    expect(ids).toContain('trending');
    expect(ids).toContain('new-releases');
    expect(ids).toContain('hidden-gems');
  });

  it('throws when registering a duplicate id', () => {
    registerShelf(makeDefinition('trending'));
    expect(() => registerShelf(makeDefinition('trending'))).toThrow(
      'Shelf already registered: trending'
    );
  });

  it('generate() returns shelf instances', () => {
    const def = makeDefinition('trending');
    registerShelf(def);
    const profile = {
      genreAffinities: [],
      dimensionWeights: [],
      genreDistribution: [],
      totalMoviesWatched: 5,
      totalComparisons: 10,
    };
    const instances = def.generate(profile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe('trending');
    expect(instances[0]!.title).toBe('Title for trending');
    expect(instances[0]!.score).toBe(0.8);
  });

  it('template shelf generate() returns multiple instances', () => {
    const templateDef: ShelfDefinition = {
      id: 'because-you-watched',
      template: true,
      category: 'seed',
      generate: (_profile) => [
        makeInstance('because-you-watched:1'),
        makeInstance('because-you-watched:2'),
        makeInstance('because-you-watched:3'),
      ],
    };
    registerShelf(templateDef);
    const profile = {
      genreAffinities: [],
      dimensionWeights: [],
      genreDistribution: [],
      totalMoviesWatched: 5,
      totalComparisons: 10,
    };
    const instances = templateDef.generate(profile);
    expect(instances).toHaveLength(3);
    expect(instances[0]!.shelfId).toBe('because-you-watched:1');
    expect(instances[1]!.shelfId).toBe('because-you-watched:2');
  });

  it('shelf instance has optional seedMovieId', () => {
    const instance: ShelfInstance = {
      shelfId: 'because-you-watched:42',
      title: 'Because you watched Interstellar',
      subtitle: 'Movies similar to your recent watch',
      emoji: '🎬',
      query: async () => [],
      score: 0.9,
      seedMovieId: 42,
    };
    expect(instance.seedMovieId).toBe(42);
    expect(instance.subtitle).toBe('Movies similar to your recent watch');
    expect(instance.emoji).toBe('🎬');
  });

  it('_clearRegistry empties the registry', () => {
    registerShelf(makeDefinition('trending'));
    _clearRegistry();
    expect(getRegisteredShelves()).toHaveLength(0);
  });
});
