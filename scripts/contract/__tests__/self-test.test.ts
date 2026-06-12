/**
 * PRD-154 US-07: synthetic breaking-change self-test.
 *
 * Injects a fake breaking change into a fixture surface (modeled after
 * the finance contract) and verifies that:
 *
 *   1. `diffTsSurface` classifies it as breaking.
 *   2. `diffZodSurface` classifies it as breaking.
 *   3. `computeVerdict` returns `fail-bump-required` when the version
 *      is unchanged.
 *   4. `computeVerdict` returns `fail-bump-too-small` if a minor bump
 *      is declared for a breaking change.
 *   5. `computeVerdict` returns `pass-bumped-correctly` when the author
 *      bumps to the required major.
 *
 * Mirrors the self-test pattern from PRD-2917 — the test is the proof
 * that the CI workflow actually catches breakages, not just that the
 * sub-units agree in isolation.
 */
import { describe, expect, it } from 'vitest';

import { diffTsSurface } from '../diff-ts.js';
import { diffZodSurface } from '../diff-zod.js';
import { computeVerdict } from '../verdict.js';

import type { TsSurface, ZodSurface } from '../types.js';

const baselineTs: TsSurface = {
  contract: '@pops/finance-contract',
  version: '1.4.2',
  entries: [
    {
      entry: '.',
      name: 'WishListItem',
      kind: 'interface',
      text: 'export interface WishListItem {\n    id: string;\n    item: string;\n    targetAmount: number | null;\n}',
    },
    {
      entry: './schemas',
      name: 'WishListItemSchema',
      kind: 'variable',
      text: 'export declare const WishListItemSchema: z.ZodObject<{ id: z.ZodString; item: z.ZodString; targetAmount: z.ZodNullable<z.ZodNumber>; }>;',
    },
  ],
};

const baselineZod: ZodSurface = {
  contract: '@pops/finance-contract',
  version: '1.4.2',
  entries: [
    {
      name: 'WishListItemSchema',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          item: { type: 'string' },
          targetAmount: { type: 'number' },
        },
        required: ['id', 'item', 'targetAmount'],
      },
    },
  ],
};

function injectBreakingTs(): TsSurface {
  return {
    ...baselineTs,
    entries: baselineTs.entries.map((e) =>
      e.name === 'WishListItem'
        ? {
            ...e,
            text: 'export interface WishListItem {\n    id: number;\n    item: string;\n}',
          }
        : e
    ),
  };
}

function injectBreakingZod(): ZodSurface {
  return {
    ...baselineZod,
    entries: baselineZod.entries.map((e) =>
      e.name === 'WishListItemSchema'
        ? {
            name: e.name,
            schema: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                item: { type: 'string' },
              },
              required: ['id', 'item'],
            },
          }
        : e
    ),
  };
}

describe('PRD-154 self-test (synthetic breaking change)', () => {
  it('TS diff classifies the synthetic break as breaking', () => {
    const diff = diffTsSurface(baselineTs, injectBreakingTs());
    expect(diff.kind).toBe('breaking');
    expect(diff.changed.map((c) => c.name)).toContain('.::WishListItem');
  });

  it('Zod diff classifies the synthetic break as breaking', () => {
    const diff = diffZodSurface(baselineZod, injectBreakingZod());
    expect(diff.kind).toBe('breaking');
  });

  it('verdict is fail-bump-required when version unchanged', () => {
    const tsDiff = diffTsSurface(baselineTs, injectBreakingTs());
    const zodDiff = diffZodSurface(baselineZod, injectBreakingZod());
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '1.4.2',
      tsDiff,
      zodDiff,
    });
    expect(v.verdict).toBe('fail-bump-required');
    expect(v.requiredVersion).toBe('2.0.0');
  });

  it('verdict is fail-bump-too-small with a minor bump', () => {
    const tsDiff = diffTsSurface(baselineTs, injectBreakingTs());
    const zodDiff = diffZodSurface(baselineZod, injectBreakingZod());
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '1.5.0',
      tsDiff,
      zodDiff,
    });
    expect(v.verdict).toBe('fail-bump-too-small');
  });

  it('verdict is pass-bumped-correctly with a major bump', () => {
    const tsDiff = diffTsSurface(baselineTs, injectBreakingTs());
    const zodDiff = diffZodSurface(baselineZod, injectBreakingZod());
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '2.0.0',
      tsDiff,
      zodDiff,
    });
    expect(v.verdict).toBe('pass-bumped-correctly');
  });
});
