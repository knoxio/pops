import { describe, expect, expectTypeOf, it } from 'vitest';

import { MediaErrorSchema } from '../errors.js';
import { MovieSchema } from '../schemas/movie.js';

import type { z } from 'zod';

import type { MediaError } from '../errors.js';
import type { Movie } from '../types/movie.js';

describe('@pops/media-contract round-trip', () => {
  it('Movie ↔ MovieSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof MovieSchema>>().toEqualTypeOf<Movie>();
  });

  it('MediaError ↔ MediaErrorSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof MediaErrorSchema>>().toEqualTypeOf<MediaError>();
  });

  it('MovieSchema accepts a well-formed payload', () => {
    const payload: Movie = {
      id: 'mv_1',
      title: 'Arrival',
      year: 2016,
      tmdbId: '329865',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(MovieSchema.parse(payload)).toEqual(payload);
  });

  it('MovieSchema accepts a payload with null year and tmdbId', () => {
    const payload: Movie = {
      id: 'mv_1',
      title: 'Untitled',
      year: null,
      tmdbId: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(MovieSchema.parse(payload)).toEqual(payload);
  });

  it('MovieSchema rejects a non-integer year', () => {
    const bad = {
      id: 'mv_1',
      title: 'x',
      year: 2016.5,
      tmdbId: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => MovieSchema.parse(bad)).toThrow();
  });

  it('MovieSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad: Movie = {
      id: 'mv_1',
      title: 'x',
      year: null,
      tmdbId: null,
      lastEditedTime: '12 June 2026',
    };

    expect(() => MovieSchema.parse(bad)).toThrow();
  });

  it('MovieSchema rejects a missing title', () => {
    const bad = {
      id: 'mv_1',
      year: null,
      tmdbId: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => MovieSchema.parse(bad)).toThrow();
  });

  it('MediaErrorSchema accepts ContractStatus envelope', () => {
    expect(MediaErrorSchema.parse({ kind: 'unavailable' })).toEqual({ kind: 'unavailable' });
  });

  it('MediaErrorSchema accepts a tmdb-unavailable domain error', () => {
    const err: MediaError = { kind: 'tmdb-unavailable', tmdbId: '329865' };
    expect(MediaErrorSchema.parse(err)).toEqual(err);
  });

  it('MediaErrorSchema accepts an unknown-tmdb-id domain error', () => {
    const err: MediaError = { kind: 'unknown-tmdb-id', tmdbId: '0' };
    expect(MediaErrorSchema.parse(err)).toEqual(err);
  });

  it('MediaErrorSchema rejects an unknown kind', () => {
    expect(() => MediaErrorSchema.parse({ kind: 'mystery' })).toThrow();
  });
});
