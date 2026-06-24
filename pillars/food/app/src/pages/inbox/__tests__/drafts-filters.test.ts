import { describe, expect, it } from 'vitest';

import {
  ALL_BANDS,
  DEFAULT_DRAFTS_FILTERS,
  decodeFiltersHash,
  encodeFiltersHash,
  toQueryInput,
} from '../drafts-filters.js';

describe('drafts URL-hash codec', () => {
  it('encodes the default state to the empty string', () => {
    expect(encodeFiltersHash(DEFAULT_DRAFTS_FILTERS)).toBe('');
  });

  it('round-trips a non-trivial state through encode → decode', () => {
    const state = {
      bands: ['minor', 'attention'] as const,
      kinds: ['url-instagram'] as const,
      partialReasons: ['auth-dead'] as const,
      freshOnly: true,
      sort: 'newest' as const,
    };
    const hash = encodeFiltersHash(state);
    expect(hash.length).toBeGreaterThan(0);
    const decoded = decodeFiltersHash(`#${hash}`);
    expect(decoded.bands).toEqual(['minor', 'attention']);
    expect(decoded.kinds).toEqual(['url-instagram']);
    expect(decoded.partialReasons).toEqual(['auth-dead']);
    expect(decoded.freshOnly).toBe(true);
    expect(decoded.sort).toBe('newest');
  });

  it('decodes an empty hash to the default state', () => {
    expect(decodeFiltersHash('')).toEqual(DEFAULT_DRAFTS_FILTERS);
    expect(decodeFiltersHash('#')).toEqual(DEFAULT_DRAFTS_FILTERS);
  });

  it('decodes malformed payloads to the default state', () => {
    expect(decodeFiltersHash('#filters=not-base64!!!')).toEqual(DEFAULT_DRAFTS_FILTERS);
    expect(decodeFiltersHash('#wrong-prefix=abc')).toEqual(DEFAULT_DRAFTS_FILTERS);
  });

  it('rejects unknown band values during decode', () => {
    const hash = encodeFiltersHash({
      ...DEFAULT_DRAFTS_FILTERS,
      // @ts-expect-error — testing decode robustness
      bands: ['minor', 'unknown-band'],
    });
    const decoded = decodeFiltersHash(`#${hash}`);
    expect(decoded.bands).toEqual(['minor']);
  });

  it('collapses the "all bands selected" UI default to undefined on the wire', () => {
    const input = toQueryInput(DEFAULT_DRAFTS_FILTERS);
    expect(input.bands).toBeUndefined();
    expect(input.kinds).toBeUndefined();
    expect(input.partialReasons).toBeUndefined();
    expect(input.freshOnly).toBeUndefined();
    expect(input.sort).toBe('quality-asc');
  });

  it('ships a band array when fewer than all bands are selected', () => {
    const input = toQueryInput({
      ...DEFAULT_DRAFTS_FILTERS,
      bands: ALL_BANDS.slice(0, 2),
    });
    expect(input.bands).toEqual([...ALL_BANDS.slice(0, 2)]);
  });
});
