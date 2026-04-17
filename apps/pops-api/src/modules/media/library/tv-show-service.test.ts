import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedTvShow, setupTestContext } from '../../../shared/test-utils.js';
import { addTvShow, selectBestArtwork } from './tv-show-service.js';

import type { Database } from 'better-sqlite3';

import type { TheTvdbClient } from '../thetvdb/client.js';
import type { TvdbArtwork, TvdbEpisode, TvdbShowDetail } from '../thetvdb/types.js';
import type { ImageCacheService } from '../tmdb/image-cache.js';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  const result = ctx.setup();
  db = result.db;
});

afterEach(() => {
  ctx.teardown();
});

function makeShowDetail(overrides: Partial<TvdbShowDetail> = {}): TvdbShowDetail {
  return {
    tvdbId: 81189,
    name: 'Breaking Bad',
    originalName: null,
    overview: 'A chemistry teacher diagnosed with cancer.',
    firstAirDate: '2008-01-20',
    lastAirDate: '2013-09-29',
    status: 'Ended',
    originalLanguage: 'eng',
    averageRuntime: 47,
    genres: [
      { id: 1, name: 'Drama' },
      { id: 2, name: 'Thriller' },
    ],
    networks: [{ id: 1, name: 'AMC' }],
    seasons: [
      {
        tvdbId: 30001,
        seasonNumber: 0,
        name: 'Specials',
        overview: null,
        imageUrl: null,
        episodeCount: 2,
      },
      {
        tvdbId: 30002,
        seasonNumber: 1,
        name: 'Season 1',
        overview: 'The beginning.',
        imageUrl: 'https://artworks.thetvdb.com/s1.jpg',
        episodeCount: 7,
      },
    ],
    artworks: [
      {
        id: 1,
        type: 2,
        imageUrl: 'https://artworks.thetvdb.com/poster.jpg',
        language: 'eng',
        score: 100,
      },
      {
        id: 2,
        type: 3,
        imageUrl: 'https://artworks.thetvdb.com/backdrop.jpg',
        language: 'eng',
        score: 80,
      },
    ],
    ...overrides,
  };
}

function makeEpisodes(seasonNumber: number, count: number): TvdbEpisode[] {
  return Array.from({ length: count }, (_, i) => ({
    tvdbId: seasonNumber * 1000 + i + 1,
    episodeNumber: i + 1,
    seasonNumber,
    name: `Episode ${i + 1}`,
    overview: null,
    airDate: '2008-01-20',
    runtime: 47,
    imageUrl: null,
  }));
}

function makeMockClient(
  detail: TvdbShowDetail,
  episodeMap: Map<number, TvdbEpisode[]>
): TheTvdbClient {
  return {
    getSeriesExtended: vi.fn().mockResolvedValue(detail),
    getSeriesEpisodes: vi
      .fn()
      .mockImplementation((_tvdbId: number, seasonNumber: number) =>
        Promise.resolve(episodeMap.get(seasonNumber) ?? [])
      ),
    searchSeries: vi.fn(),
  } as unknown as TheTvdbClient;
}

describe('addTvShow', () => {
  it('adds a new show with seasons and episodes', async () => {
    const detail = makeShowDetail();
    const episodeMap = new Map([
      [0, makeEpisodes(0, 2)],
      [1, makeEpisodes(1, 3)],
    ]);
    const client = makeMockClient(detail, episodeMap);

    const result = await addTvShow(81189, client);

    expect(result.created).toBe(true);
    expect(result.show.tvdbId).toBe(81189);
    expect(result.show.name).toBe('Breaking Bad');
    expect(result.show.status).toBe('Ended');
    expect(result.show.numberOfSeasons).toBe(1); // excludes specials (S0)
    expect(result.show.numberOfEpisodes).toBe(5);
    expect(result.show.episodeRunTime).toBe(47);
    expect(result.show.posterPath).toBe('https://artworks.thetvdb.com/poster.jpg');
    expect(result.show.backdropPath).toBe('https://artworks.thetvdb.com/backdrop.jpg');
    expect(result.seasons).toHaveLength(2);
    expect(result.seasons[0]!.seasonNumber).toBe(0); // specials
    expect(result.seasons[1]!.seasonNumber).toBe(1);

    // Verify API calls
    expect(client.getSeriesExtended).toHaveBeenCalledWith(81189);
    expect(client.getSeriesEpisodes).toHaveBeenCalledTimes(2);
  });

  it('returns existing show without re-fetching (idempotent)', async () => {
    seedTvShow(db, { tvdb_id: 81189, name: 'Breaking Bad' });

    const client = makeMockClient(makeShowDetail(), new Map());
    const result = await addTvShow(81189, client);

    expect(result.created).toBe(false);
    expect(result.show.tvdbId).toBe(81189);
    expect(result.show.name).toBe('Breaking Bad');
    expect(client.getSeriesExtended).not.toHaveBeenCalled();
  });

  it('handles show with no seasons', async () => {
    const detail = makeShowDetail({ seasons: [], artworks: [] });
    const client = makeMockClient(detail, new Map());

    const result = await addTvShow(81189, client);

    expect(result.created).toBe(true);
    expect(result.show.numberOfSeasons).toBe(0);
    expect(result.show.numberOfEpisodes).toBe(0);
    expect(result.seasons).toHaveLength(0);
    expect(client.getSeriesEpisodes).not.toHaveBeenCalled();
  });

  it('handles specials (season 0)', async () => {
    const detail = makeShowDetail({
      seasons: [
        {
          tvdbId: 30001,
          seasonNumber: 0,
          name: 'Specials',
          overview: null,
          imageUrl: null,
          episodeCount: 3,
        },
      ],
    });
    const episodeMap = new Map([[0, makeEpisodes(0, 3)]]);
    const client = makeMockClient(detail, episodeMap);

    const result = await addTvShow(81189, client);

    expect(result.created).toBe(true);
    expect(result.show.numberOfSeasons).toBe(0); // specials don't count
    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0]!.seasonNumber).toBe(0);
    expect(result.show.numberOfEpisodes).toBe(3);
  });

  it('maps genres and networks to JSON arrays', async () => {
    const detail = makeShowDetail({
      genres: [
        { id: 1, name: 'Drama' },
        { id: 2, name: 'Crime' },
      ],
      networks: [
        { id: 1, name: 'AMC' },
        { id: 2, name: 'Netflix' },
      ],
    });
    const client = makeMockClient(detail, new Map());

    const result = await addTvShow(81189, client);

    expect(JSON.parse(result.show.genres!)).toEqual(['Drama', 'Crime']);
    expect(JSON.parse(result.show.networks!)).toEqual(['AMC', 'Netflix']);
  });

  it('handles show with empty genres and networks', async () => {
    const detail = makeShowDetail({ genres: [], networks: [] });
    const client = makeMockClient(detail, new Map());

    const result = await addTvShow(81189, client);

    expect(result.show.genres).toBeNull();
    expect(result.show.networks).toBeNull();
  });

  it('sets episodeCount from actual fetched episodes, not TVDB summary', async () => {
    // TVDB season summary says episodeCount: 99, but only 3 episodes are fetched.
    // The DB should reflect the actual count (3), not the summary value (99).
    const detail = makeShowDetail({
      seasons: [
        {
          tvdbId: 30002,
          seasonNumber: 1,
          name: 'Season 1',
          overview: null,
          imageUrl: null,
          episodeCount: 99,
        },
      ],
    });
    const episodeMap = new Map([[1, makeEpisodes(1, 3)]]);
    const client = makeMockClient(detail, episodeMap);

    const result = await addTvShow(81189, client);

    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0]!.episodeCount).toBe(3);
  });

  it('falls back to TVDB summary episodeCount when no episodes are fetched', async () => {
    const detail = makeShowDetail({
      seasons: [
        {
          tvdbId: 30002,
          seasonNumber: 1,
          name: 'Season 1',
          overview: null,
          imageUrl: null,
          episodeCount: 8,
        },
      ],
    });
    // No episodes fetched for this season
    const episodeMap = new Map<number, TvdbEpisode[]>([[1, []]]);
    const client = makeMockClient(detail, episodeMap);

    const result = await addTvShow(81189, client);

    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0]!.episodeCount).toBe(8);
  });

  it('sets episodeCount to null when TVDB summary is 0 and no episodes fetched', async () => {
    const detail = makeShowDetail({
      seasons: [
        {
          tvdbId: 30002,
          seasonNumber: 1,
          name: 'Season 1',
          overview: null,
          imageUrl: null,
          episodeCount: 0,
        },
      ],
    });
    const episodeMap = new Map<number, TvdbEpisode[]>([[1, []]]);
    const client = makeMockClient(detail, episodeMap);

    const result = await addTvShow(81189, client);

    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0]!.episodeCount).toBeNull();
  });

  it('inserts episodes with correct data', async () => {
    const detail = makeShowDetail({
      seasons: [
        {
          tvdbId: 30002,
          seasonNumber: 1,
          name: 'Season 1',
          overview: 'The beginning.',
          imageUrl: 'https://artworks.thetvdb.com/s1.jpg',
          episodeCount: 2,
        },
      ],
    });
    const eps: TvdbEpisode[] = [
      {
        tvdbId: 5001,
        episodeNumber: 1,
        seasonNumber: 1,
        name: 'Pilot',
        overview: 'Walter White begins.',
        airDate: '2008-01-20',
        runtime: 58,
        imageUrl: 'https://artworks.thetvdb.com/ep1.jpg',
      },
      {
        tvdbId: 5002,
        episodeNumber: 2,
        seasonNumber: 1,
        name: "Cat's in the Bag...",
        overview: null,
        airDate: '2008-01-27',
        runtime: 48,
        imageUrl: null,
      },
    ];
    const episodeMap = new Map([[1, eps]]);
    const client = makeMockClient(detail, episodeMap);

    const result = await addTvShow(81189, client);

    // Verify episodes in DB via the season
    const seasonId = result.seasons[0]!.id;
    const dbEpisodes = db
      .prepare('SELECT * FROM episodes WHERE season_id = ? ORDER BY episode_number')
      .all(seasonId) as Array<Record<string, unknown>>;

    expect(dbEpisodes).toHaveLength(2);
    expect(dbEpisodes[0]).toMatchObject({
      tvdb_id: 5001,
      episode_number: 1,
      name: 'Pilot',
      overview: 'Walter White begins.',
      air_date: '2008-01-20',
      runtime: 58,
      still_path: 'https://artworks.thetvdb.com/ep1.jpg',
    });
    expect(dbEpisodes[1]).toMatchObject({
      tvdb_id: 5002,
      episode_number: 2,
      name: "Cat's in the Bag...",
      overview: null,
      air_date: '2008-01-27',
      runtime: 48,
      still_path: null,
    });
  });

  it('propagates TheTVDB API errors', async () => {
    const client = {
      getSeriesExtended: vi.fn().mockRejectedValue(new Error('TheTVDB API error: 404 Not Found')),
    } as unknown as TheTvdbClient;

    await expect(addTvShow(99999, client)).rejects.toThrow('TheTVDB API error: 404 Not Found');
  });

  it('calls imageCache.downloadTvShowImages when provided', async () => {
    const detail = makeShowDetail();
    const episodeMap = new Map([
      [0, makeEpisodes(0, 2)],
      [1, makeEpisodes(1, 3)],
    ]);
    const client = makeMockClient(detail, episodeMap);

    const mockImageCache = {
      downloadTvShowImages: vi.fn().mockResolvedValue(undefined),
    };

    const result = await addTvShow(81189, client, mockImageCache as unknown as ImageCacheService);

    expect(result.created).toBe(true);
    expect(mockImageCache.downloadTvShowImages).toHaveBeenCalledWith(
      81189,
      'https://artworks.thetvdb.com/poster.jpg',
      'https://artworks.thetvdb.com/backdrop.jpg',
      [{ seasonNumber: 1, posterUrl: 'https://artworks.thetvdb.com/s1.jpg' }]
    );
  });

  it('does not call imageCache for existing show', async () => {
    seedTvShow(db, { tvdb_id: 81189, name: 'Breaking Bad' });

    const client = makeMockClient(makeShowDetail(), new Map());
    const mockImageCache = {
      downloadTvShowImages: vi.fn().mockResolvedValue(undefined),
    };

    const result = await addTvShow(81189, client, mockImageCache as unknown as ImageCacheService);

    expect(result.created).toBe(false);
    expect(mockImageCache.downloadTvShowImages).not.toHaveBeenCalled();
  });
});

describe('selectBestArtwork', () => {
  it('picks English poster with highest score', () => {
    const artworks: TvdbArtwork[] = [
      { id: 1, type: 2, imageUrl: 'low.jpg', language: 'eng', score: 50 },
      { id: 2, type: 2, imageUrl: 'high.jpg', language: 'eng', score: 100 },
      { id: 3, type: 2, imageUrl: 'foreign.jpg', language: 'jpn', score: 150 },
    ];

    const result = selectBestArtwork(artworks);
    expect(result.posterUrl).toBe('high.jpg');
  });

  it('prefers English over higher-scored foreign artwork', () => {
    const artworks: TvdbArtwork[] = [
      { id: 1, type: 2, imageUrl: 'eng.jpg', language: 'eng', score: 50 },
      { id: 2, type: 2, imageUrl: 'jpn.jpg', language: 'jpn', score: 200 },
    ];

    const result = selectBestArtwork(artworks);
    expect(result.posterUrl).toBe('eng.jpg');
  });

  it('falls back to non-English when no English artwork', () => {
    const artworks: TvdbArtwork[] = [
      { id: 1, type: 2, imageUrl: 'jpn.jpg', language: 'jpn', score: 100 },
    ];

    const result = selectBestArtwork(artworks);
    expect(result.posterUrl).toBe('jpn.jpg');
  });

  it('returns null when no matching artwork type', () => {
    const artworks: TvdbArtwork[] = [
      { id: 1, type: 1, imageUrl: 'banner.jpg', language: 'eng', score: 100 },
    ];

    const result = selectBestArtwork(artworks);
    expect(result.posterUrl).toBeNull();
    expect(result.backdropUrl).toBeNull();
  });

  it('returns null for empty artworks', () => {
    const result = selectBestArtwork([]);
    expect(result.posterUrl).toBeNull();
    expect(result.backdropUrl).toBeNull();
  });

  it('picks poster (type 2) and backdrop (type 3) independently', () => {
    const artworks: TvdbArtwork[] = [
      { id: 1, type: 2, imageUrl: 'poster.jpg', language: 'eng', score: 100 },
      { id: 2, type: 3, imageUrl: 'backdrop.jpg', language: 'eng', score: 80 },
    ];

    const result = selectBestArtwork(artworks);
    expect(result.posterUrl).toBe('poster.jpg');
    expect(result.backdropUrl).toBe('backdrop.jpg');
  });
});
