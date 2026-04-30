import { describe, expect, it } from 'vitest';

import { stripSurroundingQuotes } from './strip-surrounding-quotes.js';

describe('stripSurroundingQuotes', () => {
  it('strips balanced surrounding quotes', () => {
    expect(stripSurroundingQuotes('"Wuthering Heights"')).toBe('Wuthering Heights');
  });

  it('strips multiple leading/trailing quote chars (mirrors SQLite TRIM)', () => {
    expect(stripSurroundingQuotes('""Wuthering""')).toBe('Wuthering');
  });

  it('leaves an unwrapped title alone', () => {
    expect(stripSurroundingQuotes('The Dark Knight')).toBe('The Dark Knight');
  });

  it('leaves a title with only a leading quote alone', () => {
    expect(stripSurroundingQuotes('"Something')).toBe('"Something');
  });

  it('leaves a title with only a trailing quote alone', () => {
    expect(stripSurroundingQuotes('Something"')).toBe('Something"');
  });

  it('preserves internal quotes when the wrapping pair is absent', () => {
    expect(stripSurroundingQuotes('Film "Noir" Style')).toBe('Film "Noir" Style');
  });

  it('strips wrapping but preserves internal quotes', () => {
    expect(stripSurroundingQuotes('"Film "Noir" Style"')).toBe('Film "Noir" Style');
  });

  it('does not produce an empty string from bare ""', () => {
    expect(stripSurroundingQuotes('""')).toBe('""');
  });

  it('does not produce an empty string from all-quote """', () => {
    expect(stripSurroundingQuotes('"""')).toBe('"""');
  });

  it('handles empty string', () => {
    expect(stripSurroundingQuotes('')).toBe('');
  });

  it('is idempotent', () => {
    const once = stripSurroundingQuotes('"Wuthering Heights"');
    const twice = stripSurroundingQuotes(once);
    expect(twice).toBe('Wuthering Heights');
  });
});
