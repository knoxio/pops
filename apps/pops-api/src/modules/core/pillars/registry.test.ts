/**
 * Tests for the pillar registry loader (ADR-026 P2).
 *
 * The loader is a thin cache over `parsePillarsEnv` — the assertions focus on
 * the env-var integration and cache reset hook, not the parsing rules
 * (covered exhaustively in `env.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetPillarRegistryCache, getPillarEntry, getPillarRegistry } from './registry.js';

const ENV_KEY = 'POPS_PILLARS';
let original: string | undefined;

beforeEach(() => {
  original = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  __resetPillarRegistryCache();
});

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
  __resetPillarRegistryCache();
});

describe('getPillarRegistry', () => {
  it('returns empty when POPS_PILLARS is unset', () => {
    expect(getPillarRegistry()).toEqual([]);
  });

  it('parses POPS_PILLARS when set', () => {
    process.env[ENV_KEY] = 'food:http://food-api:3000';
    expect(getPillarRegistry()).toEqual([{ id: 'food', baseUrl: 'http://food-api:3000' }]);
  });

  it('memoises the parsed registry across calls', () => {
    process.env[ENV_KEY] = 'food:http://food-api:3000';
    const first = getPillarRegistry();
    // Mutate env after the first call; cached snapshot must NOT pick it up.
    process.env[ENV_KEY] = 'finance:http://finance-api:3000';
    expect(getPillarRegistry()).toBe(first);
  });

  it('re-reads after __resetPillarRegistryCache', () => {
    process.env[ENV_KEY] = 'food:http://food-api:3000';
    getPillarRegistry();
    process.env[ENV_KEY] = 'finance:http://finance-api:3000';
    __resetPillarRegistryCache();
    expect(getPillarRegistry()).toEqual([{ id: 'finance', baseUrl: 'http://finance-api:3000' }]);
  });
});

describe('getPillarEntry', () => {
  it('returns the entry when present', () => {
    process.env[ENV_KEY] = 'food:http://food-api:3000,finance:http://finance-api:3000';
    expect(getPillarEntry('food')).toEqual({ id: 'food', baseUrl: 'http://food-api:3000' });
  });

  it('returns undefined when missing', () => {
    process.env[ENV_KEY] = 'food:http://food-api:3000';
    expect(getPillarEntry('finance')).toBeUndefined();
  });
});
