/**
 * Tests for TheTVDB raw → domain mappers — title quote guard (#2403).
 *
 * Mirror of the TMDB-side guard added for #2402. TheTVDB titles travel
 * through `name` (search + extended) and `name_translated.eng` /
 * `originalName`. All four are scrubbed of balanced surrounding quotes.
 */
import { describe, expect, it } from 'vitest';

import { mapSearchResult, mapShowDetail } from './types-mappers.js';

import type { RawTvdbSearchResult, RawTvdbSeriesExtended } from './types-raw.js';

function rawSearch(overrides: Partial<RawTvdbSearchResult> = {}): RawTvdbSearchResult {
  return {
    tvdb_id: '1',
    name: 'Default',
    overview: '',
    first_air_time: '2026-01-01',
    status: 'Continuing',
    image_url: null,
    thumbnail: null,
    genres: [],
    primary_language: 'en',
    year: '2026',
    ...overrides,
  };
}

function rawSeries(overrides: Partial<RawTvdbSeriesExtended> = {}): RawTvdbSeriesExtended {
  return {
    id: 1,
    name: 'Default',
    originalName: null,
    overview: '',
    firstAired: '2026-01-01',
    lastAired: null,
    status: { id: 1, name: 'Continuing' },
    originalLanguage: 'en',
    averageRuntime: 60,
    genres: [],
    networks: [],
    seasons: [],
    artworks: [],
    ...overrides,
  };
}

describe('mapSearchResult — title quote guard (#2403)', () => {
  it('strips surrounding quotes from name', () => {
    const result = mapSearchResult(rawSearch({ name: '"The Wire"' }));
    expect(result.name).toBe('The Wire');
  });

  it('strips surrounding quotes from name_translated.eng (originalName)', () => {
    const result = mapSearchResult(rawSearch({ name_translated: { eng: '"Breaking Bad"' } }));
    expect(result.originalName).toBe('Breaking Bad');
  });

  it('leaves originalName null when no translation is provided', () => {
    const result = mapSearchResult(rawSearch({ name_translated: null }));
    expect(result.originalName).toBeNull();
  });

  it('leaves clean names alone', () => {
    const result = mapSearchResult(rawSearch({ name: 'Breaking Bad' }));
    expect(result.name).toBe('Breaking Bad');
  });

  it('does not strip one-sided quotes', () => {
    const result = mapSearchResult(rawSearch({ name: 'Lopsided"' }));
    expect(result.name).toBe('Lopsided"');
  });
});

describe('mapShowDetail — title quote guard (#2403)', () => {
  it('strips surrounding quotes from name', () => {
    const detail = mapShowDetail(rawSeries({ name: '"The Sopranos"' }));
    expect(detail.name).toBe('The Sopranos');
  });

  it('strips surrounding quotes from originalName', () => {
    const detail = mapShowDetail(rawSeries({ originalName: '"Los Soprano"' }));
    expect(detail.originalName).toBe('Los Soprano');
  });

  it('preserves null originalName', () => {
    const detail = mapShowDetail(rawSeries({ originalName: null }));
    expect(detail.originalName).toBeNull();
  });

  it('leaves clean names alone', () => {
    const detail = mapShowDetail(rawSeries({ name: 'Mad Men' }));
    expect(detail.name).toBe('Mad Men');
  });
});
