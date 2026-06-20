/**
 * Tests for TMDB raw → domain mappers.
 *
 * Issue #2402 — guard at the mapper layer so titles returned by TMDB with
 * surrounding double-quote characters never reach the database in that
 * form (root cause of #2343, the *Wuthering Heights* 2026 record).
 */
import { describe, expect, it } from 'vitest';

import { mapMovieDetail, mapMovieResult } from './client-mappers.js';

import type { RawTmdbMovieDetail, RawTmdbSearchResponse } from './types.js';

type RawMovieResult = RawTmdbSearchResponse['results'][number];

function rawSearchResult(overrides: Partial<RawMovieResult> = {}): RawMovieResult {
  return {
    id: 1,
    title: 'Default Title',
    original_title: 'Default Original',
    overview: '',
    release_date: '2026-01-01',
    poster_path: null,
    backdrop_path: null,
    vote_average: 0,
    vote_count: 0,
    genre_ids: [],
    original_language: 'en',
    popularity: 0,
    ...overrides,
  };
}

function rawMovieDetail(overrides: Partial<RawTmdbMovieDetail> = {}): RawTmdbMovieDetail {
  return {
    id: 1,
    imdb_id: null,
    title: 'Default Title',
    original_title: 'Default Original',
    overview: '',
    tagline: '',
    release_date: '2026-01-01',
    runtime: 0,
    status: '',
    original_language: 'en',
    budget: 0,
    revenue: 0,
    poster_path: null,
    backdrop_path: null,
    vote_average: 0,
    vote_count: 0,
    genres: [],
    production_companies: [],
    spoken_languages: [],
    ...overrides,
  };
}

describe('mapMovieResult — title quote guard (#2402)', () => {
  it('strips surrounding quotes from title', () => {
    const result = mapMovieResult(rawSearchResult({ title: '"Wuthering Heights"' }));
    expect(result.title).toBe('Wuthering Heights');
  });

  it('strips surrounding quotes from originalTitle', () => {
    const result = mapMovieResult(rawSearchResult({ original_title: '"Cumbres Borrascosas"' }));
    expect(result.originalTitle).toBe('Cumbres Borrascosas');
  });

  it('leaves clean titles alone', () => {
    const result = mapMovieResult(rawSearchResult({ title: 'The Dark Knight' }));
    expect(result.title).toBe('The Dark Knight');
  });

  it('preserves titles with internal quotes', () => {
    const result = mapMovieResult(rawSearchResult({ title: 'Film "Noir" Style' }));
    expect(result.title).toBe('Film "Noir" Style');
  });

  it('does not strip one-sided quotes', () => {
    const result = mapMovieResult(rawSearchResult({ title: '"Lopsided' }));
    expect(result.title).toBe('"Lopsided');
  });
});

describe('mapMovieDetail — title quote guard (#2402)', () => {
  it('strips surrounding quotes from title', () => {
    const detail = mapMovieDetail(rawMovieDetail({ title: '"Wuthering Heights"' }));
    expect(detail.title).toBe('Wuthering Heights');
  });

  it('strips surrounding quotes from originalTitle', () => {
    const detail = mapMovieDetail(rawMovieDetail({ original_title: '"Cumbres Borrascosas"' }));
    expect(detail.originalTitle).toBe('Cumbres Borrascosas');
  });

  it('leaves clean titles alone', () => {
    const detail = mapMovieDetail(rawMovieDetail({ title: 'Inception' }));
    expect(detail.title).toBe('Inception');
  });
});
