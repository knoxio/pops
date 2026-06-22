import { describe, expect, it, vi } from 'vitest';

import { HITS_PER_SECTION, searchAll, type PillarSearchGroup } from '../engine.js';

import type { SearchContext, SearchHit } from '../types.js';

const ROOT: SearchContext = { app: null, page: null };

function hit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    uri: overrides.uri ?? 'pops:test/1',
    score: overrides.score ?? 0.5,
    matchField: overrides.matchField ?? 'name',
    matchType: overrides.matchType ?? 'contains',
    data: overrides.data ?? {},
  };
}

function group(overrides: Partial<PillarSearchGroup> = {}): PillarSearchGroup {
  return {
    domain: overrides.domain ?? 'finance',
    moduleId: overrides.moduleId ?? 'finance',
    icon: overrides.icon ?? 'ArrowRightLeft',
    color: overrides.color ?? 'green',
    hits: overrides.hits ?? [hit()],
  };
}

function sourceOf(...groups: PillarSearchGroup[]) {
  return vi.fn(async () => groups);
}

describe('searchAll', () => {
  it('invokes the injected source with the query and context', async () => {
    const source = sourceOf();
    const query = { text: 'rent' };

    await searchAll(query, ROOT, { source });

    expect(source).toHaveBeenCalledWith(query, ROOT);
  });

  it('returns one section per non-empty group, carrying its decoration', async () => {
    const result = await searchAll({ text: 'x' }, ROOT, {
      source: sourceOf(
        group({
          domain: 'core',
          moduleId: 'core',
          icon: 'Building2',
          color: 'green',
          hits: [hit()],
        }),
        group({
          domain: 'inventory',
          moduleId: 'inventory',
          icon: 'Package',
          color: 'amber',
          hits: [hit()],
        })
      ),
    });

    expect(result.sections).toHaveLength(2);
    const core = result.sections.find((s) => s.domain === 'core')!;
    expect(core).toMatchObject({ moduleId: 'core', icon: 'Building2', color: 'green' });
  });

  it('drops groups with no hits', async () => {
    const result = await searchAll({ text: 'x' }, ROOT, {
      source: sourceOf(
        group({ domain: 'core', hits: [hit()] }),
        group({ domain: 'inventory', hits: [] })
      ),
    });

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.domain).toBe('core');
  });

  it('sorts hits within a section by score descending and reports totalCount', async () => {
    const result = await searchAll({ text: 'x' }, ROOT, {
      source: sourceOf(
        group({
          hits: [
            hit({ uri: 'a', score: 0.5 }),
            hit({ uri: 'b', score: 1.0 }),
            hit({ uri: 'c', score: 0.8 }),
          ],
        })
      ),
    });

    const section = result.sections[0]!;
    expect(section.hits.map((h) => h.score)).toEqual([1.0, 0.8, 0.5]);
    expect(section.totalCount).toBe(3);
  });

  it('caps hits per section but keeps the full totalCount', async () => {
    const many = Array.from({ length: 12 }, (_, i) => hit({ uri: `u${i}`, score: 1 - i * 0.05 }));
    const result = await searchAll({ text: 'x' }, ROOT, {
      source: sourceOf(group({ hits: many })),
    });

    expect(result.sections[0]!.hits).toHaveLength(HITS_PER_SECTION);
    expect(result.sections[0]!.totalCount).toBe(12);
  });

  describe('section ordering', () => {
    it('orders context sections before non-context sections', async () => {
      const result = await searchAll(
        { text: 'x' },
        { app: 'inventory', page: 'items' },
        {
          source: sourceOf(
            group({ domain: 'finance', moduleId: 'finance', hits: [hit({ score: 1.0 })] }),
            group({ domain: 'inventory', moduleId: 'inventory', hits: [hit({ score: 0.3 })] })
          ),
        }
      );

      expect(result.sections[0]!.domain).toBe('inventory');
      expect(result.sections[0]!.isContextSection).toBe(true);
      expect(result.sections[1]!.domain).toBe('finance');
      expect(result.sections[1]!.isContextSection).toBe(false);
    });

    it('orders non-context sections by top hit score descending', async () => {
      const result = await searchAll(
        { text: 'x' },
        { app: 'core', page: 'home' },
        {
          source: sourceOf(
            group({ domain: 'finance', moduleId: 'finance', hits: [hit({ score: 0.4 })] }),
            group({ domain: 'inventory', moduleId: 'inventory', hits: [hit({ score: 0.9 })] })
          ),
        }
      );

      expect(result.sections.map((s) => s.domain)).toEqual(['inventory', 'finance']);
    });

    it('never marks a section as context when the app is null', async () => {
      const result = await searchAll({ text: 'x' }, ROOT, {
        source: sourceOf(group({ domain: 'finance', moduleId: 'finance', hits: [hit()] })),
      });

      expect(result.sections[0]!.isContextSection).toBe(false);
    });
  });
});
