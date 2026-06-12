import { describe, expect, it } from 'vitest';

import { diffTsSurface } from '../diff-ts.js';

import type { TsSurface, TsSurfaceEntry } from '../types.js';

function surface(entries: TsSurfaceEntry[]): TsSurface {
  return { contract: '@pops/finance-contract', version: '0.1.0', entries };
}

const e = (entry: string, name: string, text: string, kind: TsSurfaceEntry['kind'] = 'type') => ({
  entry,
  name,
  kind,
  text,
});

describe('diffTsSurface', () => {
  it('returns "none" for identical surfaces', () => {
    const surf = surface([e('.', 'A', 'export type A = string;')]);
    const result = diffTsSurface(surf, surf);
    expect(result.kind).toBe('none');
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);
  });

  it('classifies pure additions as additive', () => {
    const baseline = surface([e('.', 'A', 'export type A = string;')]);
    const current = surface([
      e('.', 'A', 'export type A = string;'),
      e('.', 'B', 'export type B = number;'),
    ]);
    const result = diffTsSurface(baseline, current);
    expect(result.kind).toBe('additive');
    expect(result.added).toEqual(['.::B']);
  });

  it('classifies removals as breaking', () => {
    const baseline = surface([
      e('.', 'A', 'export type A = string;'),
      e('.', 'B', 'export type B = number;'),
    ]);
    const current = surface([e('.', 'A', 'export type A = string;')]);
    const result = diffTsSurface(baseline, current);
    expect(result.kind).toBe('breaking');
    expect(result.removed).toEqual(['.::B']);
  });

  it('classifies signature changes as breaking', () => {
    const baseline = surface([e('.', 'A', 'export type A = string;')]);
    const current = surface([e('.', 'A', 'export type A = number;')]);
    const result = diffTsSurface(baseline, current);
    expect(result.kind).toBe('breaking');
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]?.name).toBe('.::A');
  });

  it('classifies removal + addition as breaking (a rename)', () => {
    const baseline = surface([e('.', 'A', 'export type A = string;')]);
    const current = surface([e('.', 'B', 'export type B = string;')]);
    const result = diffTsSurface(baseline, current);
    expect(result.kind).toBe('breaking');
    expect(result.added).toEqual(['.::B']);
    expect(result.removed).toEqual(['.::A']);
  });

  it('treats same name in different entry points as distinct symbols', () => {
    const baseline = surface([e('.', 'A', 'export type A = string;')]);
    const current = surface([
      e('.', 'A', 'export type A = string;'),
      e('./schemas', 'A', 'export type A = string;'),
    ]);
    expect(diffTsSurface(baseline, current).added).toEqual(['./schemas::A']);
  });

  it('reports diff kind changes (interface → type) as breaking', () => {
    const baseline = surface([e('.', 'A', 'export interface A { x: string; }', 'interface')]);
    const current = surface([e('.', 'A', 'export interface A { x: string; }', 'type')]);
    const result = diffTsSurface(baseline, current);
    expect(result.kind).toBe('breaking');
  });
});
