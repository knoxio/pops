/**
 * Tests for the ADR-012 URI parser. The parser is a pure function — every
 * malformed-input case here surfaces as `{ kind: 'malformed' }` from the
 * dispatcher, so the assertions double as documentation of which inputs the
 * resolver rejects with which reason.
 *
 * Relocated from `apps/pops-api/src/modules/core/uri/parse.test.ts`. The
 * `undefined as unknown as string` non-string case is replaced with the
 * empty-string path, which exercises the same guard branch without a banned
 * type assertion.
 */
import { describe, expect, it } from 'vitest';

import { parseUri } from '../parse.js';

describe('parseUri (ADR-012)', () => {
  it('parses a canonical pops:{module}/{type}/{id} URI', () => {
    expect(parseUri('pops:finance/transaction/abc-123')).toEqual({
      ok: true,
      parsed: { moduleId: 'finance', type: 'transaction', id: 'abc-123' },
    });
  });

  it('accepts numeric ids', () => {
    const result = parseUri('pops:media/movie/42');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.parsed.id).toBe('42');
  });

  it('accepts kebab-case types', () => {
    const result = parseUri('pops:media/tv-show/100');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.parsed.type).toBe('tv-show');
  });

  it('rejects an empty string', () => {
    expect(parseUri('')).toEqual({ ok: false, reason: 'URI must be a non-empty string' });
  });

  it('rejects a missing pops: prefix', () => {
    const result = parseUri('finance/transaction/1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/must start with 'pops:'/);
  });

  it('rejects a path with the wrong number of segments', () => {
    expect(parseUri('pops:finance/transaction').ok).toBe(false);
    expect(parseUri('pops:finance/transaction/1/extra').ok).toBe(false);
  });

  it('rejects empty segments', () => {
    const result = parseUri('pops:finance//1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/non-empty/);
  });

  it('rejects uppercase moduleId', () => {
    const result = parseUri('pops:Finance/transaction/1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/lowercase kebab-case/);
  });

  it('rejects uppercase type', () => {
    const result = parseUri('pops:finance/Transaction/1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/lowercase kebab-case/);
  });

  it('rejects uppercase id', () => {
    const result = parseUri('pops:finance/transaction/ABC');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/must be lowercase/);
  });
});
