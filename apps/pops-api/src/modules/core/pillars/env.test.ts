/**
 * Tests for `parsePillarsEnv` (ADR-026 P2).
 *
 * Covers the strict-fail-fast contract: any structural problem in
 * `POPS_PILLARS` is a deploy-config bug that should surface at boot, not at
 * the first URI dispatch.
 */
import { describe, expect, it } from 'vitest';

import { parsePillarsEnv, PillarsEnvParseError } from './env.js';

describe('parsePillarsEnv', () => {
  it('returns empty registry for undefined/empty input when allowEmpty', () => {
    expect(parsePillarsEnv(undefined)).toEqual([]);
    expect(parsePillarsEnv('')).toEqual([]);
    expect(parsePillarsEnv('   ')).toEqual([]);
  });

  it('throws on empty input when allowEmpty is false', () => {
    expect(() => parsePillarsEnv('', { allowEmpty: false })).toThrow(PillarsEnvParseError);
  });

  it('parses a single pillar entry', () => {
    expect(parsePillarsEnv('food:http://food-api:3000')).toEqual([
      { id: 'food', baseUrl: 'http://food-api:3000' },
    ]);
  });

  it('parses multiple pillar entries', () => {
    expect(parsePillarsEnv('food:http://food-api:3000,finance:http://finance-api:3000')).toEqual([
      { id: 'food', baseUrl: 'http://food-api:3000' },
      { id: 'finance', baseUrl: 'http://finance-api:3000' },
    ]);
  });

  it('tolerates whitespace around id and baseUrl', () => {
    expect(
      parsePillarsEnv(' food : http://food-api:3000 , finance : http://finance-api:3000 ')
    ).toEqual([
      { id: 'food', baseUrl: 'http://food-api:3000' },
      { id: 'finance', baseUrl: 'http://finance-api:3000' },
    ]);
  });

  it('strips trailing slash from baseUrl', () => {
    expect(parsePillarsEnv('food:http://food-api:3000/')).toEqual([
      { id: 'food', baseUrl: 'http://food-api:3000' },
    ]);
  });

  it('rejects baseUrl with a path prefix', () => {
    expect(() => parsePillarsEnv('food:http://food-api:3000/api')).toThrow(/bare origin/);
  });

  it('rejects baseUrl with a query string', () => {
    expect(() => parsePillarsEnv('food:http://food-api:3000?x=1')).toThrow(/bare origin/);
  });

  it('rejects baseUrl with a fragment', () => {
    expect(() => parsePillarsEnv('food:http://food-api:3000#frag')).toThrow(/bare origin/);
  });

  it('accepts https baseUrls', () => {
    expect(parsePillarsEnv('food:https://food.example.com')).toEqual([
      { id: 'food', baseUrl: 'https://food.example.com' },
    ]);
  });

  it('rejects non-http(s) baseUrls', () => {
    expect(() => parsePillarsEnv('food:ftp://food-api')).toThrow(/must use http or https/);
    expect(() => parsePillarsEnv('food:file:///etc/passwd')).toThrow(/must use http or https/);
  });

  it('rejects entry missing the colon separator', () => {
    expect(() => parsePillarsEnv('food-only')).toThrow(/missing ':' between id and baseUrl/);
  });

  it('rejects empty id', () => {
    expect(() => parsePillarsEnv(':http://food-api')).toThrow(/empty id/);
  });

  it('rejects empty baseUrl', () => {
    expect(() => parsePillarsEnv('food:')).toThrow(/empty baseUrl/);
  });

  it('rejects invalid pillar id slugs', () => {
    expect(() => parsePillarsEnv('Food:http://food-api')).toThrow(/lowercase kebab-case/);
    expect(() => parsePillarsEnv('food_one:http://food-api')).toThrow(/lowercase kebab-case/);
    expect(() => parsePillarsEnv('food one:http://food-api')).toThrow(/lowercase kebab-case/);
  });

  it('rejects duplicate pillar ids', () => {
    expect(() => parsePillarsEnv('food:http://a:3000,food:http://b:3000')).toThrow(
      /duplicate pillar id 'food'/
    );
  });

  it('rejects stray commas (empty entries)', () => {
    expect(() => parsePillarsEnv('food:http://food-api,,finance:http://finance-api')).toThrow(
      /empty entry between commas/
    );
    expect(() => parsePillarsEnv(',food:http://food-api')).toThrow(/empty entry between commas/);
    expect(() => parsePillarsEnv('food:http://food-api,')).toThrow(/empty entry between commas/);
  });

  it('rejects garbage URLs', () => {
    expect(() => parsePillarsEnv('food:not a url')).toThrow(/not a valid URL/);
  });
});
