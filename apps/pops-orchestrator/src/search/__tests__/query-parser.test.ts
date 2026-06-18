import { describe, expect, it } from 'vitest';

import { parseQuery } from '../query-parser.js';

describe('parseQuery', () => {
  it('returns plain text with no filters for a bare query', () => {
    expect(parseQuery('coffee table')).toEqual({ text: 'coffee table' });
  });

  it('extracts a known key:value token as a filter', () => {
    expect(parseQuery('type:movie batman')).toEqual({
      text: 'batman',
      filters: [{ key: 'type', value: 'movie' }],
    });
  });

  it('collapses a comparison operator into the filter value', () => {
    expect(parseQuery('year:>2020 dune')).toEqual({
      text: 'dune',
      filters: [{ key: 'year', value: '>2020' }],
    });
  });

  it('treats an unknown key:value token as plain text', () => {
    expect(parseQuery('colour:red shirt')).toEqual({ text: 'colour:red shirt' });
  });

  it('handles multiple filters and interleaved text', () => {
    expect(parseQuery('type:tv year:<1999 alien value:>50')).toEqual({
      text: 'alien',
      filters: [
        { key: 'type', value: 'tv' },
        { key: 'year', value: '<1999' },
        { key: 'value', value: '>50' },
      ],
    });
  });

  it('collapses surrounding whitespace', () => {
    expect(parseQuery('   spaced   out   ')).toEqual({ text: 'spaced out' });
  });

  it('returns empty text for a blank input', () => {
    expect(parseQuery('   ')).toEqual({ text: '' });
  });
});
