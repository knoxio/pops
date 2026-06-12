import { describe, expect, it } from 'vitest';

import { diffZodSurface } from '../diff-zod.js';

import type { ZodSurface, ZodSurfaceEntry } from '../types.js';

function surface(entries: ZodSurfaceEntry[]): ZodSurface {
  return { contract: '@pops/finance-contract', version: '0.1.0', entries };
}

describe('diffZodSurface', () => {
  it('returns "none" for identical surfaces', () => {
    const s = surface([
      {
        name: 'A',
        schema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
      },
    ]);
    expect(diffZodSurface(s, s).kind).toBe('none');
  });

  it('classifies added top-level schema as additive', () => {
    const baseline = surface([{ name: 'A', schema: { type: 'string' } }]);
    const current = surface([
      { name: 'A', schema: { type: 'string' } },
      { name: 'B', schema: { type: 'number' } },
    ]);
    const r = diffZodSurface(baseline, current);
    expect(r.kind).toBe('additive');
    expect(r.added).toEqual(['B']);
  });

  it('classifies removed top-level schema as breaking', () => {
    const baseline = surface([
      { name: 'A', schema: { type: 'string' } },
      { name: 'B', schema: { type: 'string' } },
    ]);
    const current = surface([{ name: 'A', schema: { type: 'string' } }]);
    expect(diffZodSurface(baseline, current).kind).toBe('breaking');
  });

  it('classifies a newly required property as breaking', () => {
    const baseline = surface([
      {
        name: 'A',
        schema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
      },
    ]);
    const current = surface([
      {
        name: 'A',
        schema: {
          type: 'object',
          properties: { x: { type: 'string' }, y: { type: 'string' } },
          required: ['x', 'y'],
        },
      },
    ]);
    const r = diffZodSurface(baseline, current);
    expect(r.kind).toBe('breaking');
    expect(r.changed[0]?.reason).toMatch(/required property added \(y\)/);
  });

  it('classifies a newly optional property as additive', () => {
    const baseline = surface([
      {
        name: 'A',
        schema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
      },
    ]);
    const current = surface([
      {
        name: 'A',
        schema: {
          type: 'object',
          properties: { x: { type: 'string' }, y: { type: 'string' } },
          required: ['x'],
        },
      },
    ]);
    const r = diffZodSurface(baseline, current);
    expect(r.kind).toBe('additive');
    expect(r.changed[0]?.reason).toMatch(/optional property added \(y\)/);
  });

  it('classifies a removed enum value as breaking', () => {
    const baseline = surface([{ name: 'E', schema: { type: 'string', enum: ['a', 'b', 'c'] } }]);
    const current = surface([{ name: 'E', schema: { type: 'string', enum: ['a', 'b'] } }]);
    const r = diffZodSurface(baseline, current);
    expect(r.kind).toBe('breaking');
    expect(r.changed[0]?.reason).toMatch(/enum value removed/);
  });

  it('classifies an added enum value as additive', () => {
    const baseline = surface([{ name: 'E', schema: { type: 'string', enum: ['a', 'b'] } }]);
    const current = surface([{ name: 'E', schema: { type: 'string', enum: ['a', 'b', 'c'] } }]);
    expect(diffZodSurface(baseline, current).kind).toBe('additive');
  });

  it('classifies a property type change as breaking', () => {
    const baseline = surface([
      {
        name: 'A',
        schema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
      },
    ]);
    const current = surface([
      {
        name: 'A',
        schema: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'] },
      },
    ]);
    expect(diffZodSurface(baseline, current).kind).toBe('breaking');
  });

  it('classifies optional → required as breaking', () => {
    const baseline = surface([
      {
        name: 'A',
        schema: { type: 'object', properties: { x: { type: 'string' } }, required: [] },
      },
    ]);
    const current = surface([
      {
        name: 'A',
        schema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
      },
    ]);
    const r = diffZodSurface(baseline, current);
    expect(r.kind).toBe('breaking');
    expect(r.changed[0]?.reason).toMatch(/made required/);
  });

  it('classifies required → optional as additive', () => {
    const baseline = surface([
      {
        name: 'A',
        schema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
      },
    ]);
    const current = surface([
      {
        name: 'A',
        schema: { type: 'object', properties: { x: { type: 'string' } }, required: [] },
      },
    ]);
    expect(diffZodSurface(baseline, current).kind).toBe('additive');
  });

  it('classifies a narrowed minimum as breaking', () => {
    const baseline = surface([{ name: 'N', schema: { type: 'number', minimum: 0 } }]);
    const current = surface([{ name: 'N', schema: { type: 'number', minimum: 10 } }]);
    expect(diffZodSurface(baseline, current).kind).toBe('breaking');
  });

  it('classifies a widened maximum as additive', () => {
    const baseline = surface([{ name: 'N', schema: { type: 'number', maximum: 100 } }]);
    const current = surface([{ name: 'N', schema: { type: 'number', maximum: 200 } }]);
    expect(diffZodSurface(baseline, current).kind).toBe('additive');
  });

  it('classifies a tightened pattern as breaking', () => {
    const baseline = surface([{ name: 'S', schema: { type: 'string', pattern: '^.+$' } }]);
    const current = surface([{ name: 'S', schema: { type: 'string', pattern: '^[a-z]+$' } }]);
    expect(diffZodSurface(baseline, current).kind).toBe('breaking');
  });

  it('classifies a removed union member as breaking', () => {
    const baseline = surface([
      { name: 'U', schema: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
    ]);
    const current = surface([{ name: 'U', schema: { anyOf: [{ type: 'string' }] } }]);
    expect(diffZodSurface(baseline, current).kind).toBe('breaking');
  });

  it('classifies a newly added union member as additive', () => {
    const baseline = surface([{ name: 'U', schema: { anyOf: [{ type: 'string' }] } }]);
    const current = surface([
      { name: 'U', schema: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
    ]);
    expect(diffZodSurface(baseline, current).kind).toBe('additive');
  });

  it('classifies a nested property removal as breaking', () => {
    const baseline = surface([
      {
        name: 'A',
        schema: {
          type: 'object',
          properties: {
            inner: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
          },
          required: ['inner'],
        },
      },
    ]);
    const current = surface([
      {
        name: 'A',
        schema: {
          type: 'object',
          properties: {
            inner: { type: 'object', properties: {}, required: [] },
          },
          required: ['inner'],
        },
      },
    ]);
    expect(diffZodSurface(baseline, current).kind).toBe('breaking');
  });
});
