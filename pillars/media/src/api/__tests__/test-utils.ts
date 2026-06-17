/**
 * Supertest-backed REST client for the media integration tests.
 *
 * Preserves a caller-shaped API (`client.movies.create({...})`,
 * `client.movies.list()`) so per-test bodies stay readable — only the
 * transport changed. Non-2xx responses throw `HttpError` with the parsed
 * `{ status, body }` so tests assert on `.rejects.toMatchObject({ status })`.
 */
import supertest from 'supertest';

import type { Express } from 'express';

import type { LibraryItem } from '../modules/library-types.js';
import type { Movie } from '../modules/movie-types.js';
import type { Episode, Season, TvShow } from '../modules/tv-show-types.js';
import type {
  BatchLogResult,
  BatchProgressEntry,
  RecentWatchHistoryEntry,
  TvShowProgress,
  WatchHistoryEntry,
} from '../modules/watch-history-types.js';
import type { WatchlistEntry } from '../modules/watchlist-types.js';

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    const message =
      body !== null && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${status}`;
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

async function send<T>(req: supertest.Test): Promise<T> {
  const res = await req;
  if (res.status >= 200 && res.status < 300) return res.body as T;
  throw new HttpError(res.status, res.body);
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface MovieQuery {
  search?: string;
  genre?: string;
  limit?: number;
  offset?: number;
}

export interface WatchlistQuery {
  mediaType?: 'movie' | 'tv_show';
  limit?: number;
  offset?: number;
}

export function makeClient(app: Express) {
  const r = supertest(app);
  return {
    movies: {
      list: (query: MovieQuery = {}) =>
        send<{ data: Movie[]; pagination: Pagination }>(r.get('/movies').query(query)),
      get: (id: number) => send<{ data: Movie }>(r.get(`/movies/${id}`)),
      create: (body: Record<string, unknown>) =>
        send<{ data: Movie; message: string }>(r.post('/movies').send(body)),
      update: (id: number, data: Record<string, unknown>) =>
        send<{ data: Movie; message: string }>(r.patch(`/movies/${id}`).send(data)),
      delete: (id: number) => send<{ message: string }>(r.delete(`/movies/${id}`)),
    },
    tvShows: {
      list: (query: { search?: string; status?: string; limit?: number; offset?: number } = {}) =>
        send<{ data: TvShow[]; pagination: Pagination }>(r.get('/tv-shows').query(query)),
      get: (id: number) => send<{ data: TvShow }>(r.get(`/tv-shows/${id}`)),
      create: (body: Record<string, unknown>) =>
        send<{ data: TvShow; message: string }>(r.post('/tv-shows').send(body)),
      update: (id: number, data: Record<string, unknown>) =>
        send<{ data: TvShow; message: string }>(r.patch(`/tv-shows/${id}`).send(data)),
      delete: (id: number) => send<{ message: string }>(r.delete(`/tv-shows/${id}`)),
      listSeasons: (tvShowId: number) =>
        send<{ data: Season[]; total: number }>(r.get(`/tv-shows/${tvShowId}/seasons`)),
      createSeason: (tvShowId: number, body: Record<string, unknown>) =>
        send<{ data: Season; message: string }>(r.post(`/tv-shows/${tvShowId}/seasons`).send(body)),
      deleteSeason: (id: number) => send<{ message: string }>(r.delete(`/seasons/${id}`)),
      listEpisodes: (seasonId: number) =>
        send<{ data: Episode[]; total: number }>(r.get(`/seasons/${seasonId}/episodes`)),
      createEpisode: (seasonId: number, body: Record<string, unknown>) =>
        send<{ data: Episode; message: string }>(
          r.post(`/seasons/${seasonId}/episodes`).send(body)
        ),
      deleteEpisode: (id: number) => send<{ message: string }>(r.delete(`/episodes/${id}`)),
    },
    library: {
      list: (query: Record<string, unknown> = {}) =>
        send<{ data: LibraryItem[]; pagination: Record<string, number | boolean> }>(
          r.get('/library').query(query)
        ),
      genres: () => send<{ data: string[] }>(r.get('/library/genres')),
      quickPick: (query: { count?: number } = {}) =>
        send<{ data: Movie[] }>(r.get('/library/quick-pick').query(query)),
      addMovie: (tmdbId: number) =>
        send<{ data: Movie; created: boolean; message: string }>(
          r.post('/library/movies').send({ tmdbId })
        ),
      refreshMovie: (id: number, body: { redownloadImages?: boolean } = {}) =>
        send<{ data: Movie; message: string }>(r.patch(`/library/movies/${id}`).send(body)),
      addTvShow: (tvdbId: number) =>
        send<{ data: { show: TvShow; seasons: Season[] }; created: boolean; message: string }>(
          r.post('/library/tv-shows').send({ tvdbId })
        ),
      refreshTvShow: (
        id: number,
        body: { redownloadImages?: boolean; refreshEpisodes?: boolean } = {}
      ) =>
        send<{
          data: { show: TvShow; seasons: Season[] };
          episodesAdded: number;
          episodesUpdated: number;
          seasonsAdded: number;
          seasonsUpdated: number;
          message: string;
        }>(r.patch(`/library/tv-shows/${id}`).send(body)),
    },
    watchlist: {
      list: (query: WatchlistQuery = {}) =>
        send<{ data: WatchlistEntry[]; pagination: Pagination }>(r.get('/watchlist').query(query)),
      status: (query: { mediaType: string; mediaId: number }) =>
        send<{ onWatchlist: boolean; entryId: number | null }>(
          r.get('/watchlist/status').query(query)
        ),
      get: (id: number) => send<{ data: WatchlistEntry }>(r.get(`/watchlist/${id}`)),
      add: (body: Record<string, unknown>) =>
        send<{ data: WatchlistEntry; created: boolean; message: string }>(
          r.post('/watchlist').send(body)
        ),
      reorder: (items: { id: number; priority: number }[]) =>
        send<{ message: string }>(r.post('/watchlist/reorder').send({ items })),
      update: (id: number, data: Record<string, unknown>) =>
        send<{ data: WatchlistEntry; message: string }>(r.patch(`/watchlist/${id}`).send(data)),
      remove: (id: number) => send<{ message: string }>(r.delete(`/watchlist/${id}`)),
    },
    watchHistory: {
      list: (
        query: { mediaType?: string; mediaId?: number; limit?: number; offset?: number } = {}
      ) =>
        send<{ data: WatchHistoryEntry[]; pagination: Pagination }>(
          r.get('/watch-history').query(query)
        ),
      listRecent: (
        query: { mediaType?: string; startDate?: string; endDate?: string; limit?: number } = {}
      ) =>
        send<{ data: RecentWatchHistoryEntry[]; pagination: Pagination }>(
          r.get('/watch-history/recent').query(query)
        ),
      progress: (tvShowId: number) =>
        send<{ data: TvShowProgress }>(r.get(`/watch-history/progress/${tvShowId}`)),
      batchProgress: (tvShowIds: number[]) =>
        send<{ data: BatchProgressEntry[] }>(
          r.post('/watch-history/batch-progress').send({ tvShowIds })
        ),
      get: (id: number) => send<{ data: WatchHistoryEntry }>(r.get(`/watch-history/${id}`)),
      log: (body: Record<string, unknown>) =>
        send<{ data: WatchHistoryEntry; watchlistRemoved: boolean; message: string }>(
          r.post('/watch-history').send(body)
        ),
      batchLog: (body: Record<string, unknown>) =>
        send<{ data: BatchLogResult; message: string }>(r.post('/watch-history/batch').send(body)),
      delete: (id: number) => send<{ message: string }>(r.delete(`/watch-history/${id}`)),
    },
    shelfImpressions: {
      record: (shelfIds: string[]) =>
        send<{ ok: true; recorded: number }>(r.post('/shelf-impressions').send({ shelfIds })),
      recent: (query: { days?: number } = {}) =>
        send<{ windowDays: number; entries: { shelfId: string; impressionCount: number }[] }>(
          r.get('/shelf-impressions/recent').query(query)
        ),
      freshness: (query: { shelfId: string; days?: number }) =>
        send<{ shelfId: string; impressionCount: number; freshness: number }>(
          r.get('/shelf-impressions/freshness').query(query)
        ),
      cleanup: () => send<{ ok: true }>(r.post('/shelf-impressions/cleanup').send({})),
    },
    arr: {
      config: () =>
        send<{ data: { radarrConfigured: boolean; sonarrConfigured: boolean } }>(
          r.get('/arr/config')
        ),
      settings: () =>
        send<{
          data: {
            radarrUrl: string;
            radarrConfigured: boolean;
            sonarrUrl: string;
            sonarrConfigured: boolean;
          };
        }>(r.get('/arr/settings')),
      queue: () => send<{ data: Record<string, unknown>[] }>(r.get('/arr/queue')),
      radarrQualityProfiles: () =>
        send<{ data: { id: number; name: string }[] }>(r.get('/arr/radarr/quality-profiles')),
      radarrRootFolders: () =>
        send<{ data: { id: number; path: string; freeSpace: number }[] }>(
          r.get('/arr/radarr/root-folders')
        ),
      checkMovie: (tmdbId: number) =>
        send<{ data: { exists: boolean; radarrId?: number; monitored?: boolean } }>(
          r.get(`/arr/radarr/movies/${tmdbId}/check`)
        ),
      movieStatus: (tmdbId: number) =>
        send<{ data: { status: string; label: string; progress?: number } }>(
          r.get(`/arr/radarr/movies/${tmdbId}/status`)
        ),
      addMovie: (body: Record<string, unknown>) =>
        send<{ data: Record<string, unknown> }>(r.post('/arr/radarr/movies').send(body)),
      updateRadarrMonitoring: (radarrId: number, monitored: boolean) =>
        send<{ data: Record<string, unknown> }>(
          r.patch(`/arr/radarr/movies/${radarrId}/monitoring`).send({ monitored })
        ),
      triggerRadarrSearch: (radarrId: number) =>
        send<{ data: Record<string, unknown> }>(
          r.post(`/arr/radarr/movies/${radarrId}/search`).send({})
        ),
      testRadarr: (body: { url: string; apiKey: string }) =>
        send<{ data: Record<string, unknown>; message?: string }>(
          r.post('/arr/radarr/test').send(body)
        ),
      testRadarrSaved: () =>
        send<{ data: Record<string, unknown>; message?: string }>(
          r.post('/arr/radarr/test-saved').send({})
        ),
      downloadAndProtect: (body: { tmdbId: number; title: string; year: number }) =>
        send<{ data: { alreadyInRadarr: boolean } }>(
          r.post('/arr/radarr/download-and-protect').send(body)
        ),
      sonarrQualityProfiles: () =>
        send<{ data: { id: number; name: string }[] }>(r.get('/arr/sonarr/quality-profiles')),
      sonarrLanguageProfiles: () =>
        send<{ data: { id: number; name: string }[] }>(r.get('/arr/sonarr/language-profiles')),
      calendar: (query: { start: string; end: string }) =>
        send<{ data: Record<string, unknown>[] }>(r.get('/arr/sonarr/calendar').query(query)),
      checkSeries: (tvdbId: number) =>
        send<{ data: { exists: boolean; sonarrId?: number } }>(
          r.get(`/arr/sonarr/series/${tvdbId}/check`)
        ),
      showStatus: (tvdbId: number) =>
        send<{ data: { status: string; label: string } }>(
          r.get(`/arr/sonarr/series/${tvdbId}/status`)
        ),
      seriesEpisodes: (sonarrId: number, query: { seasonNumber?: number } = {}) =>
        send<{ data: Record<string, unknown>[] }>(
          r.get(`/arr/sonarr/series/${sonarrId}/episodes`).query(query)
        ),
      addSeries: (body: Record<string, unknown>) =>
        send<{ data: Record<string, unknown> }>(r.post('/arr/sonarr/series').send(body)),
      updateSeriesMonitoring: (sonarrId: number, monitored: boolean) =>
        send<{ data: Record<string, unknown> }>(
          r.patch(`/arr/sonarr/series/${sonarrId}/monitoring`).send({ monitored })
        ),
      updateSeasonMonitoring: (sonarrId: number, seasonNumber: number, monitored: boolean) =>
        send<{ message: string }>(
          r.patch(`/arr/sonarr/series/${sonarrId}/seasons/${seasonNumber}/monitoring`).send({
            monitored,
          })
        ),
      updateEpisodeMonitoring: (episodeIds: number[], monitored: boolean) =>
        send<{ message: string }>(
          r.patch('/arr/sonarr/episodes/monitoring').send({ episodeIds, monitored })
        ),
      triggerSeriesSearch: (sonarrId: number, seasonNumber?: number) =>
        send<{ data: Record<string, unknown> }>(
          r.post(`/arr/sonarr/series/${sonarrId}/search`).send({ seasonNumber })
        ),
      testSonarr: (body: { url: string; apiKey: string }) =>
        send<{ data: Record<string, unknown>; message?: string }>(
          r.post('/arr/sonarr/test').send(body)
        ),
      testSonarrSaved: () =>
        send<{ data: Record<string, unknown>; message?: string }>(
          r.post('/arr/sonarr/test-saved').send({})
        ),
    },
  };
}
