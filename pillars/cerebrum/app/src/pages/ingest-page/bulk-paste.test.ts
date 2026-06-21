/**
 * Tests for bulk-paste split helpers (PRD-081 US-08).
 */
import { describe, expect, it } from 'vitest';

import { hasSeparator, splitOnSeparator } from './bulk-paste';

describe('splitOnSeparator', () => {
  it('returns one segment when there are no separators', () => {
    const out = splitOnSeparator('A single thought across\ntwo lines.');
    expect(out).toHaveLength(1);
    expect(out[0]?.body).toBe('A single thought across\ntwo lines.');
  });

  it('splits on a `---` line and returns one segment per non-empty chunk', () => {
    const body = 'first thought\n---\nsecond thought\n---\nthird';
    const out = splitOnSeparator(body);
    expect(out.map((s) => s.body)).toEqual(['first thought', 'second thought', 'third']);
  });

  it('skips empty segments silently', () => {
    const body = '   \n---\nfirst\n---\n\n---\nsecond\n---';
    const out = splitOnSeparator(body);
    expect(out.map((s) => s.body)).toEqual(['first', 'second']);
  });

  it('returns an empty array when the body is whitespace + separators only', () => {
    expect(splitOnSeparator('---\n\n---\n   ')).toEqual([]);
  });

  it('tolerates indentation/trailing whitespace around the separator', () => {
    const body = 'first\n   ---   \nsecond';
    const out = splitOnSeparator(body);
    expect(out.map((s) => s.body)).toEqual(['first', 'second']);
  });

  it('preserves internal blank lines and Markdown formatting in each segment', () => {
    const body = '# A\n\nbody A\n---\n# B\n\n- list\n- items';
    const out = splitOnSeparator(body);
    expect(out[0]?.body).toBe('# A\n\nbody A');
    expect(out[1]?.body).toBe('# B\n\n- list\n- items');
  });

  it('builds a single-line preview truncated to 60 chars with an ellipsis', () => {
    const long = 'x '.repeat(80);
    const out = splitOnSeparator(long);
    const preview = out[0]?.preview ?? '';
    expect(preview.length).toBeLessThanOrEqual(60);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('flattens newlines in the preview', () => {
    const out = splitOnSeparator('line one\nline two');
    expect(out[0]?.preview).toBe('line one line two');
  });

  it('reports the original chunk index so error messages can locate the segment', () => {
    const out = splitOnSeparator('a\n---\n  \n---\nc');
    expect(out.map((s) => s.index)).toEqual([0, 2]);
  });
});

describe('hasSeparator', () => {
  it('returns false for bodies without a `---` line', () => {
    expect(hasSeparator('no separators here')).toBe(false);
    expect(hasSeparator('inline --- not a separator')).toBe(false);
  });

  it('returns true for a `---` line at any position', () => {
    expect(hasSeparator('a\n---\nb')).toBe(true);
    expect(hasSeparator('---')).toBe(true);
  });
});
