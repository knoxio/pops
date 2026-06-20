/**
 * TheTVDB response mapping tests with realistic fixture data.
 */
import { describe, expect, it } from 'vitest';

import {
  extractGenreNames,
  extractNetworkNames,
  mapArtworks,
  mapEpisode,
  mapSearchResult,
  mapShowDetail,
  type RawTvdbEpisode,
  type RawTvdbSearchResult,
  type RawTvdbSeriesExtended,
  toEpisodeInsert,
  toSeasonInsert,
  toTvShowInsert,
  TvdbApiError,
  type TvdbArtwork,
} from './types.js';

// ---------------------------------------------------------------------------
// Fixtures — realistic TheTVDB v4 API response shapes
// ---------------------------------------------------------------------------

const RAW_SEARCH_RESULT: RawTvdbSearchResult = {
  tvdb_id: '81189',
  objectID: '81189',
  name: 'Breaking Bad',
  name_translated: { eng: 'Breaking Bad' },
  overview: 'Walter White, a New Mexico chemistry teacher, is diagnosed with Stage III cancer.',
  first_air_time: '2008-01-20',
  status: 'Ended',
  primary_language: 'eng',
  image_url: 'https://artworks.thetvdb.com/banners/posters/81189-1.jpg',
  thumbnail: 'https://artworks.thetvdb.com/banners/posters/81189-1-thumb.jpg',
  year: '2008',
  genres: ['Drama', 'Thriller', 'Crime'],
  overviews: { eng: 'Walter White...' },
  aliases: ['BB'],
};

const RAW_SERIES_EXTENDED: RawTvdbSeriesExtended = {
  id: 81189,
  name: 'Breaking Bad',
  originalName: null,
  overview: 'Walter White, a New Mexico chemistry teacher, is diagnosed with Stage III cancer.',
  firstAired: '2008-01-20',
  lastAired: '2013-09-29',
  status: { id: 2, name: 'Ended' },
  originalLanguage: 'eng',
  averageRuntime: 47,
  genres: [
    { id: 1, name: 'Drama' },
    { id: 2, name: 'Thriller' },
    { id: 3, name: 'Crime' },
  ],
  networks: [
    { id: 1, name: 'AMC' },
    { id: 2, name: 'Sony Pictures Television' },
  ],
  seasons: [
    {
      id: 30272,
      number: 0,
      name: 'Specials',
      overview: null,
      image: null,
      type: { id: 1, name: 'Aired Order', type: 'default' },
      episodes: [{ id: 1 }, { id: 2 }],
    },
    {
      id: 30273,
      number: 1,
      name: 'Season 1',
      overview: 'The first season.',
      image: 'https://artworks.thetvdb.com/banners/seasons/81189-1.jpg',
      type: { id: 1, name: 'Aired Order', type: 'default' },
      episodes: [{ id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }, { id: 9 }],
    },
    {
      id: 30274,
      number: 2,
      name: 'Season 2',
      overview: 'The second season.',
      image: 'https://artworks.thetvdb.com/banners/seasons/81189-2.jpg',
      type: { id: 1, name: 'Aired Order', type: 'default' },
      episodes: Array.from({ length: 13 }, (_, i) => ({ id: 100 + i })),
    },
    {
      id: 99999,
      number: 1,
      name: 'DVD Order Season 1',
      overview: null,
      image: null,
      type: { id: 2, name: 'DVD Order', type: 'dvd' },
      episodes: [],
    },
  ],
  artworks: [
    {
      id: 1001,
      type: 2,
      image: 'https://artworks.thetvdb.com/banners/posters/81189-eng.jpg',
      language: 'eng',
      score: 100,
    },
    {
      id: 1002,
      type: 2,
      image: 'https://artworks.thetvdb.com/banners/posters/81189-jpn.jpg',
      language: 'jpn',
      score: 120,
    },
    {
      id: 1003,
      type: 3,
      image: 'https://artworks.thetvdb.com/banners/backgrounds/81189-1.jpg',
      language: 'eng',
      score: 80,
    },
    {
      id: 1004,
      type: 1,
      image: 'https://artworks.thetvdb.com/banners/banners/81189-1.jpg',
      language: 'eng',
      score: 50,
    },
  ],
};

const RAW_EPISODE: RawTvdbEpisode = {
  id: 349232,
  number: 1,
  seasonNumber: 1,
  name: 'Pilot',
  overview: 'Walter White, a 50-year-old chemistry teacher, decides to cook meth.',
  aired: '2008-01-20',
  runtime: 58,
  image: 'https://artworks.thetvdb.com/banners/episodes/81189/349232.jpg',
};

// ---------------------------------------------------------------------------
// mapSearchResult
// ---------------------------------------------------------------------------

describe('mapSearchResult', () => {
  it('maps a raw search result to domain shape', () => {
    const result = mapSearchResult(RAW_SEARCH_RESULT);

    expect(result).toEqual({
      tvdbId: 81189,
      name: 'Breaking Bad',
      originalName: 'Breaking Bad',
      overview: expect.stringContaining('chemistry teacher'),
      firstAirDate: '2008-01-20',
      status: 'Ended',
      posterPath: 'https://artworks.thetvdb.com/banners/posters/81189-1.jpg',
      genres: ['Drama', 'Thriller', 'Crime'],
      originalLanguage: 'eng',
      year: '2008',
    });
  });

  it('handles missing/undefined fields gracefully', () => {
    const minimal: RawTvdbSearchResult = {
      name: 'Minimal Show',
    };

    const result = mapSearchResult(minimal);

    expect(result.tvdbId).toBe(0);
    expect(result.overview).toBeNull();
    expect(result.firstAirDate).toBeNull();
    expect(result.posterPath).toBeNull();
    expect(result.genres).toEqual([]);
    expect(result.originalLanguage).toBeNull();
    expect(result.year).toBeNull();
  });

  it('falls back to objectID when tvdb_id missing', () => {
    const result = mapSearchResult({ ...RAW_SEARCH_RESULT, tvdb_id: undefined, objectID: '12345' });
    expect(result.tvdbId).toBe(12345);
  });

  it('falls back to thumbnail when image_url missing', () => {
    const result = mapSearchResult({ ...RAW_SEARCH_RESULT, image_url: undefined });
    expect(result.posterPath).toBe(
      'https://artworks.thetvdb.com/banners/posters/81189-1-thumb.jpg'
    );
  });
});

// ---------------------------------------------------------------------------
// mapShowDetail
// ---------------------------------------------------------------------------

describe('mapShowDetail', () => {
  it('maps a raw extended series response', () => {
    const detail = mapShowDetail(RAW_SERIES_EXTENDED);

    expect(detail.tvdbId).toBe(81189);
    expect(detail.name).toBe('Breaking Bad');
    expect(detail.status).toBe('Ended');
    expect(detail.originalLanguage).toBe('eng');
    expect(detail.averageRuntime).toBe(47);
    expect(detail.firstAirDate).toBe('2008-01-20');
    expect(detail.lastAirDate).toBe('2013-09-29');
  });

  it('extracts genres as objects', () => {
    const detail = mapShowDetail(RAW_SERIES_EXTENDED);

    expect(detail.genres).toEqual([
      { id: 1, name: 'Drama' },
      { id: 2, name: 'Thriller' },
      { id: 3, name: 'Crime' },
    ]);
  });

  it('extracts networks', () => {
    const detail = mapShowDetail(RAW_SERIES_EXTENDED);

    expect(detail.networks).toEqual([
      { id: 1, name: 'AMC' },
      { id: 2, name: 'Sony Pictures Television' },
    ]);
  });

  it('filters seasons to default/official order only', () => {
    const detail = mapShowDetail(RAW_SERIES_EXTENDED);

    // 3 default seasons (0, 1, 2) — DVD order season filtered out
    expect(detail.seasons).toHaveLength(3);
    expect(detail.seasons.map((s) => s.seasonNumber)).toEqual([0, 1, 2]);
  });

  it('includes seasons with no type (fallback)', () => {
    const raw: RawTvdbSeriesExtended = {
      ...RAW_SERIES_EXTENDED,
      seasons: [
        {
          id: 1,
          number: 1,
          // no type field — should be included
          episodes: [{ id: 1 }],
        },
      ],
    };
    const detail = mapShowDetail(raw);
    expect(detail.seasons).toHaveLength(1);
  });

  it("counts episodes from season's episodes array", () => {
    const detail = mapShowDetail(RAW_SERIES_EXTENDED);

    expect(detail.seasons[0]!.episodeCount).toBe(2);
    expect(detail.seasons[1]!.episodeCount).toBe(7);
    expect(detail.seasons[2]!.episodeCount).toBe(13);
  });

  it('maps artworks', () => {
    const detail = mapShowDetail(RAW_SERIES_EXTENDED);

    expect(detail.artworks).toHaveLength(4);
    expect(detail.artworks[0]).toEqual({
      id: 1001,
      type: 2,
      imageUrl: 'https://artworks.thetvdb.com/banners/posters/81189-eng.jpg',
      language: 'eng',
      score: 100,
    });
  });

  it('handles show with no seasons', () => {
    const detail = mapShowDetail({ ...RAW_SERIES_EXTENDED, seasons: undefined });
    expect(detail.seasons).toEqual([]);
  });

  it('handles undefined genres/networks/artworks', () => {
    const detail = mapShowDetail({
      ...RAW_SERIES_EXTENDED,
      genres: undefined,
      networks: undefined,
      artworks: undefined,
    });
    expect(detail.genres).toEqual([]);
    expect(detail.networks).toEqual([]);
    expect(detail.artworks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mapEpisode
// ---------------------------------------------------------------------------

describe('mapEpisode', () => {
  it('maps a raw episode to domain shape', () => {
    const episode = mapEpisode(RAW_EPISODE);

    expect(episode).toEqual({
      tvdbId: 349232,
      episodeNumber: 1,
      seasonNumber: 1,
      name: 'Pilot',
      overview: expect.stringContaining('50-year-old'),
      airDate: '2008-01-20',
      runtime: 58,
      imageUrl: 'https://artworks.thetvdb.com/banners/episodes/81189/349232.jpg',
    });
  });

  it('handles undefined fields', () => {
    const raw: RawTvdbEpisode = {
      id: 999,
      number: 5,
      seasonNumber: 2,
    };

    const episode = mapEpisode(raw);
    expect(episode.name).toBeNull();
    expect(episode.overview).toBeNull();
    expect(episode.airDate).toBeNull();
    expect(episode.runtime).toBeNull();
    expect(episode.imageUrl).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mapArtworks
// ---------------------------------------------------------------------------

describe('mapArtworks', () => {
  const artworks: TvdbArtwork[] = [
    { id: 1, type: 2, imageUrl: 'poster-eng.jpg', language: 'eng', score: 80 },
    { id: 2, type: 2, imageUrl: 'poster-jpn.jpg', language: 'jpn', score: 120 },
    { id: 3, type: 3, imageUrl: 'backdrop-eng.jpg', language: 'eng', score: 90 },
    { id: 4, type: 3, imageUrl: 'backdrop-null.jpg', language: null, score: 100 },
    { id: 5, type: 1, imageUrl: 'banner.jpg', language: 'eng', score: 50 },
  ];

  it('picks English poster over higher-scored non-English', () => {
    expect(mapArtworks(artworks).posterUrl).toBe('poster-eng.jpg');
  });

  it('picks English backdrop over higher-scored null-language', () => {
    expect(mapArtworks(artworks).backdropUrl).toBe('backdrop-eng.jpg');
  });

  it('falls back to highest score when no English artwork exists', () => {
    const nonEngArt: TvdbArtwork[] = [
      { id: 1, type: 2, imageUrl: 'poster-jpn.jpg', language: 'jpn', score: 80 },
      { id: 2, type: 2, imageUrl: 'poster-kor.jpg', language: 'kor', score: 120 },
    ];
    expect(mapArtworks(nonEngArt).posterUrl).toBe('poster-kor.jpg');
  });

  it('returns null when no artwork of a type exists', () => {
    const postersOnly: TvdbArtwork[] = [
      { id: 1, type: 2, imageUrl: 'poster.jpg', language: 'eng', score: 100 },
    ];
    const result = mapArtworks(postersOnly);
    expect(result.posterUrl).toBe('poster.jpg');
    expect(result.backdropUrl).toBeNull();
  });

  it('returns both null for empty array', () => {
    const result = mapArtworks([]);
    expect(result.posterUrl).toBeNull();
    expect(result.backdropUrl).toBeNull();
  });

  it('sorts by score among multiple English artworks', () => {
    const multiEng: TvdbArtwork[] = [
      { id: 1, type: 2, imageUrl: 'low.jpg', language: 'eng', score: 50 },
      { id: 2, type: 2, imageUrl: 'high.jpg', language: 'eng', score: 100 },
    ];
    expect(mapArtworks(multiEng).posterUrl).toBe('high.jpg');
  });
});

// ---------------------------------------------------------------------------
// extractGenreNames / extractNetworkNames
// ---------------------------------------------------------------------------

describe('extractGenreNames', () => {
  it('extracts names from genre objects', () => {
    expect(
      extractGenreNames([
        { id: 1, name: 'Drama' },
        { id: 2, name: 'Comedy' },
      ])
    ).toEqual(['Drama', 'Comedy']);
  });

  it('returns empty array for empty input', () => {
    expect(extractGenreNames([])).toEqual([]);
  });
});

describe('extractNetworkNames', () => {
  it('extracts names from network objects', () => {
    expect(
      extractNetworkNames([
        { id: 1, name: 'AMC' },
        { id: 2, name: 'Netflix' },
      ])
    ).toEqual(['AMC', 'Netflix']);
  });
});

// ---------------------------------------------------------------------------
// Insert builders
// ---------------------------------------------------------------------------

describe('toTvShowInsert', () => {
  it('converts show detail to Drizzle insert value', () => {
    const detail = mapShowDetail(RAW_SERIES_EXTENDED);
    const insert = toTvShowInsert(detail);

    expect(insert.tvdbId).toBe(81189);
    expect(insert.name).toBe('Breaking Bad');
    expect(insert.originalName).toBeNull();
    expect(insert.firstAirDate).toBe('2008-01-20');
    expect(insert.lastAirDate).toBe('2013-09-29');
    expect(insert.status).toBe('Ended');
    expect(insert.originalLanguage).toBe('eng');
    expect(insert.episodeRunTime).toBe(47);
    expect(insert.numberOfSeasons).toBe(3);
    expect(insert.numberOfEpisodes).toBeNull();
    expect(insert.logoPath).toBeNull();
  });

  it('serializes genres as JSON string array', () => {
    const detail = mapShowDetail(RAW_SERIES_EXTENDED);
    expect(toTvShowInsert(detail).genres).toBe(JSON.stringify(['Drama', 'Thriller', 'Crime']));
  });

  it('serializes networks as JSON string array', () => {
    const detail = mapShowDetail(RAW_SERIES_EXTENDED);
    expect(toTvShowInsert(detail).networks).toBe(
      JSON.stringify(['AMC', 'Sony Pictures Television'])
    );
  });

  it('picks best English poster from artworks', () => {
    const detail = mapShowDetail(RAW_SERIES_EXTENDED);
    const insert = toTvShowInsert(detail);
    expect(insert.posterPath).toBe('https://artworks.thetvdb.com/banners/posters/81189-eng.jpg');
    expect(insert.backdropPath).toBe(
      'https://artworks.thetvdb.com/banners/backgrounds/81189-1.jpg'
    );
  });
});

describe('toSeasonInsert', () => {
  it('converts season summary to Drizzle insert value', () => {
    const detail = mapShowDetail(RAW_SERIES_EXTENDED);
    const season = detail.seasons[1]!; // Season 1
    const insert = toSeasonInsert(season, 42);

    expect(insert.tvShowId).toBe(42);
    expect(insert.tvdbId).toBe(30273);
    expect(insert.seasonNumber).toBe(1);
    expect(insert.name).toBe('Season 1');
    expect(insert.overview).toBe('The first season.');
    expect(insert.posterPath).toBe('https://artworks.thetvdb.com/banners/seasons/81189-1.jpg');
    expect(insert.episodeCount).toBe(7);
    expect(insert.airDate).toBeNull();
  });

  it('maps zero episodes to null', () => {
    const season = {
      tvdbId: 1,
      seasonNumber: 3,
      name: null,
      overview: null,
      imageUrl: null,
      episodeCount: 0,
    };
    expect(toSeasonInsert(season, 1).episodeCount).toBeNull();
  });
});

describe('toEpisodeInsert', () => {
  it('converts episode to Drizzle insert value', () => {
    const episode = mapEpisode(RAW_EPISODE);
    const insert = toEpisodeInsert(episode, 99);

    expect(insert.seasonId).toBe(99);
    expect(insert.tvdbId).toBe(349232);
    expect(insert.episodeNumber).toBe(1);
    expect(insert.name).toBe('Pilot');
    expect(insert.overview).toContain('50-year-old');
    expect(insert.airDate).toBe('2008-01-20');
    expect(insert.runtime).toBe(58);
    expect(insert.stillPath).toBe('https://artworks.thetvdb.com/banners/episodes/81189/349232.jpg');
    expect(insert.voteAverage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TvdbApiError
// ---------------------------------------------------------------------------

describe('TvdbApiError', () => {
  it('creates an error with status and message', () => {
    const err = new TvdbApiError(401, 'Unauthorized');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('TvdbApiError');
    expect(err.status).toBe(401);
    expect(err.message).toBe('Unauthorized');
  });
});
