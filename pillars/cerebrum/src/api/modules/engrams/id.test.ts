import { describe, expect, it } from 'vitest';

import { formatIdTimestamp, generateEngramId, slugify } from './id.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Agent Coordination Landscape')).toBe('agent-coordination-landscape');
  });

  it('strips diacritics', () => {
    expect(slugify('Café déjà vu')).toBe('cafe-deja-vu');
  });

  it('collapses runs of non-alphanumerics', () => {
    expect(slugify('foo   bar--baz_qux')).toBe('foo-bar-baz-qux');
  });

  it('truncates to 40 characters without leaving a trailing hyphen', () => {
    const out = slugify('the quick brown fox jumps over the lazy dog really fast');
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('-')).toBe(false);
  });

  it('returns "untitled" when no alphanumerics survive', () => {
    expect(slugify('???!!!')).toBe('untitled');
  });
});

describe('formatIdTimestamp', () => {
  it('formats local date and time', () => {
    const d = new Date(2026, 3, 18, 9, 5); // April 18, 09:05 local
    expect(formatIdTimestamp(d)).toBe('20260418_0905');
  });
});

describe('generateEngramId', () => {
  const now = new Date(2026, 3, 18, 9, 42);

  it('produces eng_{YYYYMMDD}_{HHmm}_{slug}', () => {
    expect(generateEngramId({ title: 'Hello World', now })).toBe('eng_20260418_0942_hello-world');
  });

  it('appends a counter on collision', () => {
    const taken = new Set(['eng_20260418_0942_hello', 'eng_20260418_0942_hello_2']);
    const id = generateEngramId({
      title: 'hello',
      now,
      isTaken: (c) => taken.has(c),
    });
    expect(id).toBe('eng_20260418_0942_hello_3');
  });
});
