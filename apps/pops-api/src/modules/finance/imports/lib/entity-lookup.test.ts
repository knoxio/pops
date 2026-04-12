import { describe, expect, it } from 'vitest';

import { buildEntityMaps } from './entity-lookup.js';

describe('buildEntityMaps', () => {
  it('builds entity lookup with lowercase keys', () => {
    const { entityLookup } = buildEntityMaps([
      { name: 'Woolworths', id: 'ww-id' },
      { name: 'Coles', id: 'coles-id' },
    ]);

    expect(entityLookup.get('woolworths')).toEqual({ id: 'ww-id', name: 'Woolworths' });
    expect(entityLookup.get('coles')).toEqual({ id: 'coles-id', name: 'Coles' });
    expect(entityLookup.get('Woolworths')).toBeUndefined(); // original case not stored as key
    expect(entityLookup.size).toBe(2);
  });

  it('builds alias map from comma-separated aliases', () => {
    const { aliasMap } = buildEntityMaps([
      { name: 'Woolworths', id: 'ww-id', aliases: 'WOW,Woolies,WW' },
    ]);

    expect(aliasMap.get('wow')).toBe('Woolworths');
    expect(aliasMap.get('woolies')).toBe('Woolworths');
    expect(aliasMap.get('ww')).toBe('Woolworths');
    expect(aliasMap.size).toBe(3);
  });

  it('lowercases alias keys', () => {
    const { aliasMap } = buildEntityMaps([
      { name: 'Netflix', id: 'nf-id', aliases: 'NFLX,NetFlix AU' },
    ]);

    expect(aliasMap.get('nflx')).toBe('Netflix');
    expect(aliasMap.get('netflix au')).toBe('Netflix');
    expect(aliasMap.get('NFLX')).toBeUndefined(); // uppercase not stored
  });

  it('preserves original entity name case in alias map values', () => {
    const { aliasMap } = buildEntityMaps([{ name: "McDonald's", id: 'mcd-id', aliases: 'Maccas' }]);

    expect(aliasMap.get('maccas')).toBe("McDonald's"); // original case preserved
  });

  it('filters whitespace-only aliases', () => {
    const { aliasMap } = buildEntityMaps([
      { name: 'Woolworths', id: 'ww-id', aliases: 'WOW, , ,Woolies,  ' },
    ]);

    expect(aliasMap.get('wow')).toBe('Woolworths');
    expect(aliasMap.get('woolies')).toBe('Woolworths');
    expect(aliasMap.size).toBe(2); // empty/whitespace aliases excluded
  });

  it('trims whitespace around aliases', () => {
    const { aliasMap } = buildEntityMaps([
      { name: 'Coles', id: 'coles-id', aliases: ' Coles Express , Coles Online ' },
    ]);

    expect(aliasMap.get('coles express')).toBe('Coles');
    expect(aliasMap.get('coles online')).toBe('Coles');
  });

  it('handles entities with null aliases', () => {
    const { entityLookup, aliasMap } = buildEntityMaps([
      { name: 'Woolworths', id: 'ww-id', aliases: null },
      { name: 'Coles', id: 'coles-id' },
    ]);

    expect(entityLookup.size).toBe(2);
    expect(aliasMap.size).toBe(0);
  });

  it('handles empty input', () => {
    const { entityLookup, aliasMap } = buildEntityMaps([]);

    expect(entityLookup.size).toBe(0);
    expect(aliasMap.size).toBe(0);
  });

  it('handles empty alias string', () => {
    const { aliasMap } = buildEntityMaps([{ name: 'Test', id: 'test-id', aliases: '' }]);

    expect(aliasMap.size).toBe(0);
  });

  it('handles multiple entities with aliases', () => {
    const { entityLookup, aliasMap } = buildEntityMaps([
      { name: 'Woolworths', id: 'ww-id', aliases: 'WOW,Woolies' },
      { name: 'Coles', id: 'coles-id', aliases: 'Coles Express' },
      { name: 'Netflix', id: 'nf-id' },
    ]);

    expect(entityLookup.size).toBe(3);
    expect(aliasMap.size).toBe(3);
    expect(aliasMap.get('wow')).toBe('Woolworths');
    expect(aliasMap.get('coles express')).toBe('Coles');
  });

  it('last entity wins when names collide (case-insensitive)', () => {
    const { entityLookup } = buildEntityMaps([
      { name: 'woolworths', id: 'id-1' },
      { name: 'Woolworths', id: 'id-2' },
    ]);

    // Both map to lowercase "woolworths", last one wins
    expect(entityLookup.get('woolworths')).toEqual({ id: 'id-2', name: 'Woolworths' });
    expect(entityLookup.size).toBe(1);
  });
});
