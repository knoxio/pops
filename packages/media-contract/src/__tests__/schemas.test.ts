import { describe, expect, expectTypeOf, it } from 'vitest';

import { MediaErrorSchema } from '../errors.js';
import { MovieSchema } from '../schemas/movie.js';
import { TvShowSchema } from '../schemas/tv-show.js';
import { WatchEventSchema } from '../schemas/watch-event.js';
import { WatchlistItemSchema } from '../schemas/watchlist-item.js';

import type { z } from 'zod';

import type { MediaError } from '../errors.js';
import type { Movie } from '../types/movie.js';
import type { TvShow } from '../types/tv-show.js';
import type { WatchEvent } from '../types/watch-event.js';
import type { WatchlistItem } from '../types/watchlist-item.js';

describe('@pops/media-contract round-trip', () => {
  it('Movie ↔ MovieSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof MovieSchema>>().toEqualTypeOf<Movie>();
  });

  it('TvShow ↔ TvShowSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof TvShowSchema>>().toEqualTypeOf<TvShow>();
  });

  it('WatchlistItem ↔ WatchlistItemSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof WatchlistItemSchema>>().toEqualTypeOf<WatchlistItem>();
  });

  it('WatchEvent ↔ WatchEventSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof WatchEventSchema>>().toEqualTypeOf<WatchEvent>();
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

  it('TvShowSchema accepts a well-formed payload', () => {
    const payload: TvShow = {
      id: 'tv_1',
      title: 'Severance',
      tmdbId: '95396',
      tvdbId: '371980',
      seasonCount: 2,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(TvShowSchema.parse(payload)).toEqual(payload);
  });

  it('TvShowSchema accepts a payload with all nullable fields null', () => {
    const payload: TvShow = {
      id: 'tv_2',
      title: 'Unknown',
      tmdbId: null,
      tvdbId: null,
      seasonCount: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(TvShowSchema.parse(payload)).toEqual(payload);
  });

  it('TvShowSchema rejects a negative seasonCount', () => {
    const bad = {
      id: 'tv_1',
      title: 'x',
      tmdbId: null,
      tvdbId: null,
      seasonCount: -1,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => TvShowSchema.parse(bad)).toThrow();
  });

  it('TvShowSchema rejects a numeric tmdbId (contract pins string)', () => {
    const bad = {
      id: 'tv_1',
      title: 'x',
      tmdbId: 95396,
      tvdbId: null,
      seasonCount: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => TvShowSchema.parse(bad)).toThrow();
  });

  it('TvShowSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad: TvShow = {
      id: 'tv_1',
      title: 'x',
      tmdbId: null,
      tvdbId: null,
      seasonCount: null,
      lastEditedTime: '12 June 2026',
    };

    expect(() => TvShowSchema.parse(bad)).toThrow();
  });

  it('WatchlistItemSchema accepts a movie payload', () => {
    const payload: WatchlistItem = {
      id: 'wl_1',
      mediaType: 'movie',
      targetId: 'mv_1',
      addedAt: '2026-06-12T00:00:00.000Z',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(WatchlistItemSchema.parse(payload)).toEqual(payload);
  });

  it('WatchlistItemSchema accepts a tv-show payload', () => {
    const payload: WatchlistItem = {
      id: 'wl_2',
      mediaType: 'tv-show',
      targetId: 'tv_1',
      addedAt: '2026-06-12T00:00:00.000Z',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(WatchlistItemSchema.parse(payload)).toEqual(payload);
  });

  it('WatchlistItemSchema rejects an unknown mediaType', () => {
    const bad = {
      id: 'wl_1',
      mediaType: 'episode',
      targetId: 'mv_1',
      addedAt: '2026-06-12T00:00:00.000Z',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => WatchlistItemSchema.parse(bad)).toThrow();
  });

  it('WatchlistItemSchema rejects a non-ISO-8601 addedAt', () => {
    const bad = {
      id: 'wl_1',
      mediaType: 'movie' as const,
      targetId: 'mv_1',
      addedAt: 'yesterday',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => WatchlistItemSchema.parse(bad)).toThrow();
  });

  it('WatchEventSchema accepts a well-formed payload', () => {
    const payload: WatchEvent = {
      id: 'wh_1',
      mediaType: 'movie',
      targetId: 'mv_1',
      watchedAt: '2026-06-12T20:31:00.000Z',
      progressPercent: 87.5,
      lastEditedTime: '2026-06-12T20:31:00.000Z',
    };

    expect(WatchEventSchema.parse(payload)).toEqual(payload);
  });

  it('WatchEventSchema accepts a null progressPercent', () => {
    const payload: WatchEvent = {
      id: 'wh_2',
      mediaType: 'tv-show',
      targetId: 'tv_1',
      watchedAt: '2026-06-12T20:31:00.000Z',
      progressPercent: null,
      lastEditedTime: '2026-06-12T20:31:00.000Z',
    };

    expect(WatchEventSchema.parse(payload)).toEqual(payload);
  });

  it('WatchEventSchema rejects a progressPercent above 100', () => {
    const bad = {
      id: 'wh_1',
      mediaType: 'movie' as const,
      targetId: 'mv_1',
      watchedAt: '2026-06-12T20:31:00.000Z',
      progressPercent: 150,
      lastEditedTime: '2026-06-12T20:31:00.000Z',
    };

    expect(() => WatchEventSchema.parse(bad)).toThrow();
  });

  it('WatchEventSchema rejects a negative progressPercent', () => {
    const bad = {
      id: 'wh_1',
      mediaType: 'movie' as const,
      targetId: 'mv_1',
      watchedAt: '2026-06-12T20:31:00.000Z',
      progressPercent: -5,
      lastEditedTime: '2026-06-12T20:31:00.000Z',
    };

    expect(() => WatchEventSchema.parse(bad)).toThrow();
  });

  it('WatchEventSchema rejects a non-ISO-8601 watchedAt', () => {
    const bad = {
      id: 'wh_1',
      mediaType: 'movie' as const,
      targetId: 'mv_1',
      watchedAt: '2026-06-12',
      progressPercent: null,
      lastEditedTime: '2026-06-12T20:31:00.000Z',
    };

    expect(() => WatchEventSchema.parse(bad)).toThrow();
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
