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

import type { SyncJob, SyncLogEntry } from '../../db/index.js';
import type { PlexSchedulerStatus as SchedulerStatus } from '../cron/plex-scheduler.js';
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
    plex: {
      testConnection: () =>
        send<{ data: { connected: boolean; error?: string } }>(r.get('/plex/test-connection')),
      getLibraries: () =>
        send<{
          data: { key: string; title: string; type: string }[];
        }>(r.get('/plex/libraries')),
      getPlexUrl: () => send<{ data: string | null }>(r.get('/plex/url')),
      setUrl: (url: string) => send<{ message: string }>(r.post('/plex/url').send({ url })),
      getPlexUsername: () => send<{ data: string | null }>(r.get('/plex/username')),
      getAuthPin: () =>
        send<{ data: { id: number; code: string; clientId: string } }>(
          r.post('/plex/auth/pin').send({})
        ),
      checkAuthPin: (id: number) =>
        send<{ data: { connected: boolean; username?: string | null; expired?: boolean } }>(
          r.post('/plex/auth/pin/check').send({ id })
        ),
      disconnect: () => send<{ message: string }>(r.post('/plex/disconnect').send({})),
      getSyncStatus: () =>
        send<{
          data: { configured: boolean; hasUrl: boolean; hasToken: boolean; connected: boolean };
        }>(r.get('/plex/sync-status')),
      getSectionIds: () =>
        send<{ data: { movieSectionId: string | null; tvSectionId: string | null } }>(
          r.get('/plex/section-ids')
        ),
      saveSectionIds: (body: { movieSectionId?: string; tvSectionId?: string }) =>
        send<{ message: string }>(r.post('/plex/section-ids').send(body)),
      startSyncJob: (body: {
        jobType: string;
        sectionId?: string;
        movieSectionId?: string;
        tvSectionId?: string;
      }) => send<{ data: { jobId: string } }>(r.post('/plex/sync').send(body)),
      getSyncJobStatus: (jobId: string) => send<{ data: SyncJob }>(r.get(`/plex/sync/${jobId}`)),
      getActiveSyncJobs: () => send<{ data: SyncJob[] }>(r.get('/plex/sync/active')),
      getLastSyncResults: () =>
        send<{ data: Record<string, SyncJob | null> }>(r.get('/plex/sync/last')),
      startScheduler: (
        body: { intervalMs?: number; movieSectionId?: string; tvSectionId?: string } = {}
      ) => send<{ data: SchedulerStatus }>(r.post('/plex/scheduler/start').send(body)),
      stopScheduler: () => send<{ data: SchedulerStatus }>(r.post('/plex/scheduler/stop').send({})),
      getSchedulerStatus: () => send<{ data: SchedulerStatus }>(r.get('/plex/scheduler/status')),
      getSyncLogs: (query: { limit?: number } = {}) =>
        send<{ data: SyncLogEntry[] }>(r.get('/plex/scheduler/sync-logs').query(query)),
    },
    comparisons: makeComparisonsClient(r),
    rotation: makeRotationClient(r),
    discovery: makeDiscoveryClient(r),
    search: makeSearchClient(r),
  };
}

interface MovieSearchResultWire {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  voteAverage: number;
}

interface TvShowSearchResultWire {
  tvdbId: number;
  name: string;
  year: string | null;
}

function makeSearchClient(r: ReturnType<typeof supertest>) {
  return {
    movies: (query: { query: string; page?: number }) =>
      send<{
        results: MovieSearchResultWire[];
        totalResults: number;
        totalPages: number;
        page: number;
      }>(r.get('/search/movies').query(query)),
    tvShows: (query: { query: string }) =>
      send<{ results: TvShowSearchResultWire[] }>(r.get('/search/tv-shows').query(query)),
  };
}

interface DiscoverResultWire {
  tmdbId: number;
  title: string;
  overview: string;
  releaseDate: string;
  posterPath: string | null;
  posterUrl: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  genreIds: number[];
  popularity: number;
  inLibrary: boolean;
  isWatched: boolean;
  onWatchlist: boolean;
  rotationExpiresAt?: string;
}

interface ScoredDiscoverResultWire extends DiscoverResultWire {
  matchPercentage: number;
  matchReason: string;
}

interface PreferenceProfileWire {
  genreAffinities: {
    genre: string;
    avgScore: number;
    movieCount: number;
    totalComparisons: number;
  }[];
  dimensionWeights: {
    dimensionId: number;
    name: string;
    comparisonCount: number;
    avgScore: number;
  }[];
  genreDistribution: { genre: string; watchCount: number; percentage: number }[];
  totalMoviesWatched: number;
  totalComparisons: number;
}

interface QuickPickMovieWire {
  id: number;
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  posterPath: string | null;
  posterUrl: string | null;
  backdropPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  genres: string;
  runtime: number | null;
}

interface RewatchSuggestionWire {
  id: number;
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  eloScore: number | null;
  score: number;
  inLibrary: true;
}

interface AssembledShelfWire {
  shelfId: string;
  title: string;
  subtitle: string | null;
  emoji: string | null;
  pinned: boolean;
  items: DiscoverResultWire[];
  totalCount: number;
  hasMore: boolean;
}

function makeDiscoveryClient(r: ReturnType<typeof supertest>) {
  return {
    getDismissed: () => send<{ data: number[] }>(r.get('/discovery/dismissed')),
    dismiss: (tmdbId: number) =>
      send<{ message: string }>(r.post('/discovery/dismiss').send({ tmdbId })),
    undismiss: (tmdbId: number) =>
      send<{ message: string }>(r.post('/discovery/undismiss').send({ tmdbId })),
    profile: () => send<{ data: PreferenceProfileWire }>(r.get('/discovery/profile')),
    quickPick: (query: { count?: number } = {}) =>
      send<{ data: QuickPickMovieWire[] }>(r.get('/discovery/quick-pick').query(query)),
    rewatchSuggestions: () =>
      send<{ data: RewatchSuggestionWire[] }>(r.get('/discovery/rewatch-suggestions')),
    fromYourServer: () =>
      send<{ results: ScoredDiscoverResultWire[] }>(r.get('/discovery/from-your-server')),
    trending: (query: { timeWindow?: string; page?: number } = {}) =>
      send<{ results: DiscoverResultWire[]; totalResults: number; page: number }>(
        r.get('/discovery/trending').query(query)
      ),
    trendingPlex: (query: { limit?: number } = {}) =>
      send<{ data: DiscoverResultWire[] | null }>(r.get('/discovery/trending-plex').query(query)),
    watchlistRecommendations: () =>
      send<{ results: ScoredDiscoverResultWire[]; sourceMovies: string[] }>(
        r.get('/discovery/watchlist-recommendations')
      ),
    recommendations: (query: { sampleSize?: number } = {}) =>
      send<{
        results: ScoredDiscoverResultWire[];
        sourceMovies: string[];
        totalComparisons: number;
      }>(r.get('/discovery/recommendations').query(query)),
    contextPicks: (query: { pages?: string } = {}) =>
      send<{
        collections: { id: string; title: string; emoji: string; results: DiscoverResultWire[] }[];
      }>(r.get('/discovery/context-picks').query(query)),
    genreSpotlight: () =>
      send<{
        genres: {
          genreId: number;
          genreName: string;
          results: ScoredDiscoverResultWire[];
          totalPages: number;
        }[];
      }>(r.get('/discovery/genre-spotlight')),
    genreSpotlightPage: (query: { genreId: number; page: number }) =>
      send<{
        genreId: number;
        genreName: string;
        results: ScoredDiscoverResultWire[];
        page: number;
        totalPages: number;
      }>(r.get('/discovery/genre-spotlight/page').query(query)),
    assembleSession: () =>
      send<{ shelves: AssembledShelfWire[] }>(r.post('/discovery/session').send({})),
    getShelfPage: (shelfId: string, query: { limit?: number; offset?: number } = {}) =>
      send<{ items: DiscoverResultWire[]; hasMore: boolean; totalCount: number | null }>(
        r.get(`/discovery/shelves/${encodeURIComponent(shelfId)}`).query(query)
      ),
  };
}

interface CandidateListItemWire {
  id: number;
  sourceId: number;
  tmdbId: number;
  title: string;
  year: number | null;
  rating: number | null;
  posterPath: string | null;
  status: string;
  discoveredAt: string;
  sourceName: string | null;
  sourcePriority: number | null;
}

interface CandidateStatusWire {
  inQueue: boolean;
  candidateId: number | null;
  candidateStatus: string | null;
  isExcluded: boolean;
}

interface ExclusionWire {
  id: number;
  tmdbId: number;
  title: string;
  reason: string | null;
  excludedAt: string;
}

interface SourceWire {
  id: number;
  type: string;
  name: string;
  priority: number;
  enabled: boolean;
  config: Record<string, unknown>;
  lastSyncedAt: string | null;
  syncIntervalHours: number;
  createdAt: string;
  candidateCount?: number;
}

interface SyncResultWire {
  sourceId: number;
  sourceType: string;
  candidatesFetched: number;
  candidatesInserted: number;
  candidatesSkipped: number;
}

interface PlexFriendWire {
  id: number;
  uuid: string;
  title: string;
  username: string;
  thumb: string | null;
  restricted: boolean;
  home: boolean;
}

interface RotationSettingsWire {
  enabled: string;
  cronExpression: string;
  targetFreeGb: string;
  leavingDays: string;
  dailyAdditions: string;
  avgMovieGb: string;
  protectedDays: string;
}

interface RotationSchedulerStatusWire {
  isRunning: boolean;
  isCycleRunning: boolean;
  intervalMs: number;
  cronExpression: string;
  lastCycleAt: string | null;
  lastCycleError: string | null;
  nextRunAt: string | null;
}

interface RotationLogRowWire {
  id: number;
  executedAt: string;
  moviesMarkedLeaving: number;
  moviesRemoved: number;
  moviesAdded: number;
  removalsFailed: number;
  freeSpaceGb: number;
  targetFreeGb: number;
  skippedReason: string | null;
  details: string | null;
}

interface CycleResultWire {
  moviesMarkedLeaving: number;
  moviesRemoved: number;
  moviesAdded: number;
  removalsFailed: number;
  freeSpaceGb: number;
  targetFreeGb: number;
  skippedReason: string | null;
}

interface LeavingMovieWire {
  id: number;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  rotationExpiresAt: string | null;
  rotationMarkedAt: string | null;
}

interface RadarrDiskWire {
  path: string;
  label: string;
  freeSpace: number;
  totalSpace: number;
}

function makeRotationClient(r: ReturnType<typeof supertest>) {
  return {
    addToQueue: (body: Record<string, unknown>) =>
      send<{ message: string }>(r.post('/rotation/candidates').send(body)),
    listCandidates: (query: Record<string, unknown> = {}) =>
      send<{ data: { items: CandidateListItemWire[]; total: number } }>(
        r.get('/rotation/candidates').query(query)
      ),
    getCandidateStatus: (tmdbId: number) =>
      send<{ data: CandidateStatusWire }>(r.get(`/rotation/candidates/status/${tmdbId}`)),
    removeFromQueue: (tmdbId: number) =>
      send<{ data: { success: boolean } }>(r.delete(`/rotation/candidates/${tmdbId}`)),
    downloadCandidate: (candidateId: number) =>
      send<{ data: { success: boolean; alreadyInRadarr: boolean } }>(
        r.post(`/rotation/candidates/${candidateId}/download`).send({})
      ),
    addExclusion: (body: Record<string, unknown>) =>
      send<{ message: string }>(r.post('/rotation/exclusions').send(body)),
    listExclusions: (query: { limit?: number; offset?: number } = {}) =>
      send<{ data: { items: ExclusionWire[]; total: number } }>(
        r.get('/rotation/exclusions').query(query)
      ),
    getExclusion: (tmdbId: number) =>
      send<{ data: ExclusionWire | null }>(r.get(`/rotation/exclusions/${tmdbId}`)),
    removeExclusion: (tmdbId: number) =>
      send<{ data: { success: boolean } }>(r.delete(`/rotation/exclusions/${tmdbId}`)),
    sourceTypes: () => send<{ data: { types: string[] } }>(r.get('/rotation/source-types')),
    listPlexFriends: () =>
      send<{ data: { friends: PlexFriendWire[]; error: string | null } }>(
        r.get('/rotation/plex-friends')
      ),
    listSources: () => send<{ data: SourceWire[] }>(r.get('/rotation/sources')),
    createSource: (body: Record<string, unknown>) =>
      send<{ data: SourceWire }>(r.post('/rotation/sources').send(body)),
    updateSource: (id: number, body: Record<string, unknown>) =>
      send<{ data: SourceWire }>(r.patch(`/rotation/sources/${id}`).send(body)),
    deleteSource: (id: number) =>
      send<{ data: { success: boolean } }>(r.delete(`/rotation/sources/${id}`)),
    syncSource: (id: number) =>
      send<{ data: SyncResultWire }>(r.post(`/rotation/sources/${id}/sync`).send({})),
    getSettings: () => send<{ data: RotationSettingsWire }>(r.get('/rotation/settings')),
    saveSettings: (body: Record<string, unknown>) =>
      send<{ data: { success: boolean; updated: number } }>(
        r.post('/rotation/settings').send(body)
      ),
    schedulerStatus: () =>
      send<{ data: RotationSchedulerStatusWire }>(r.get('/rotation/scheduler/status')),
    schedulerToggle: (body: { enabled: boolean; cronExpression?: string }) =>
      send<{ data: RotationSchedulerStatusWire }>(r.post('/rotation/scheduler/toggle').send(body)),
    schedulerRunNow: () =>
      send<{ data: { success: boolean; result: CycleResultWire | null } }>(
        r.post('/rotation/scheduler/run-now').send({})
      ),
    schedulerLeavingMovies: () =>
      send<{ data: LeavingMovieWire[] }>(r.get('/rotation/scheduler/leaving')),
    schedulerCancelLeaving: (movieId: number) =>
      send<{ data: { success: boolean; message: string } }>(
        r.post(`/rotation/scheduler/leaving/${movieId}/cancel`).send({})
      ),
    schedulerLastCycleLog: () =>
      send<{ data: RotationLogRowWire | null }>(r.get('/rotation/scheduler/last-cycle')),
    schedulerDiskSpace: () =>
      send<{ data: { available: boolean; disks: RadarrDiskWire[] } }>(
        r.get('/rotation/scheduler/disk-space')
      ),
    listRotationLog: (query: { limit?: number; offset?: number } = {}) =>
      send<{ data: { items: RotationLogRowWire[]; total: number } }>(
        r.get('/rotation/scheduler/log').query(query)
      ),
    rotationLogStats: () =>
      send<{ data: { totalRotated: number; avgPerDay: number; streak: number } }>(
        r.get('/rotation/scheduler/log-stats')
      ),
  };
}

interface DimensionWire {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  weight: number;
  createdAt: string;
}

interface ComparisonWire {
  id: number;
  dimensionId: number;
  mediaAType: string;
  mediaAId: number;
  mediaBType: string;
  mediaBId: number;
  winnerType: string;
  winnerId: number;
  drawTier: string | null;
  source: string | null;
  deltaA: number | null;
  deltaB: number | null;
  comparedAt: string;
}

interface MediaScoreWire {
  id: number;
  mediaType: string;
  mediaId: number;
  dimensionId: number;
  score: number;
  comparisonCount: number;
  confidence: number;
  excluded: boolean;
  updatedAt: string;
}

interface RankedEntryWire {
  rank: number;
  mediaType: string;
  mediaId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
  confidence: number;
}

interface PairMovieWire {
  id: number;
  title: string;
  posterPath: string | null;
  posterUrl: string | null;
}

interface SmartPairWire {
  movieA: PairMovieWire;
  movieB: PairMovieWire;
  dimensionId: number;
}

interface TierListMovieWire {
  id: number;
  title: string;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
  tierOverride: string | null;
}

interface ScoreChangeWire {
  movieId: number;
  oldScore: number;
  newScore: number;
}

type MediaTypeWire = 'movie' | 'tv_show';

function makeComparisonsClient(r: ReturnType<typeof supertest>) {
  return {
    listDimensions: () => send<{ data: DimensionWire[] }>(r.get('/comparison-dimensions')),
    createDimension: (body: Record<string, unknown>) =>
      send<{ data: DimensionWire; message: string }>(r.post('/comparison-dimensions').send(body)),
    updateDimension: (id: number, body: Record<string, unknown>) =>
      send<{ data: DimensionWire; message: string }>(
        r.patch(`/comparison-dimensions/${id}`).send(body)
      ),
    record: (body: Record<string, unknown>) =>
      send<{ data: ComparisonWire; message: string }>(r.post('/comparisons').send(body)),
    listForMedia: (query: Record<string, unknown>) =>
      send<{ data: ComparisonWire[]; pagination: Pagination }>(
        r.get('/comparisons/for-media').query(query)
      ),
    listAll: (query: Record<string, unknown> = {}) =>
      send<{ data: ComparisonWire[]; pagination: Pagination }>(r.get('/comparisons').query(query)),
    delete: (id: number) => send<{ message: string }>(r.delete(`/comparisons/${id}`)),
    blacklistMovie: (body: { mediaType: MediaTypeWire; mediaId: number }) =>
      send<{
        data: {
          blacklistedCount: number;
          comparisonsDeleted: number;
          dimensionsRecalculated: number;
        };
        message: string;
      }>(r.post('/comparisons/blacklist-movie').send(body)),
    batchRecord: (body: Record<string, unknown>) =>
      send<{ data: { count: number; skipped: number }; message: string }>(
        r.post('/comparisons/batch').send(body)
      ),
    recordSkip: (body: Record<string, unknown>) =>
      send<{ data: { skipUntil: number }; message: string }>(
        r.post('/comparisons/skip').send(body)
      ),
    recalcAll: () =>
      send<{ data: { dimensionsRecalculated: number }; message: string }>(
        r.post('/comparisons/recalc-all').send({})
      ),
    getSmartPair: (query: { dimensionId?: number } = {}) =>
      send<{ data: SmartPairWire | null; reason: 'insufficient_watched_movies' | null }>(
        r.get('/comparisons/smart-pair').query(query)
      ),
    scores: (query: { mediaType: MediaTypeWire; mediaId: number; dimensionId?: number }) =>
      send<{ data: MediaScoreWire[] }>(r.get('/comparison-scores').query(query)),
    rankings: (query: Record<string, unknown> = {}) =>
      send<{ data: RankedEntryWire[]; pagination: Pagination }>(
        r.get('/comparison-rankings').query(query)
      ),
    excludeFromDimension: (body: {
      mediaType: MediaTypeWire;
      mediaId: number;
      dimensionId: number;
    }) => send<{ comparisonsDeleted: number }>(r.post('/comparison-scores/exclude').send(body)),
    includeInDimension: (body: {
      mediaType: MediaTypeWire;
      mediaId: number;
      dimensionId: number;
    }) => send<{ message: string }>(r.post('/comparison-scores/include').send(body)),
    markStale: (body: { mediaType: MediaTypeWire; mediaId: number }) =>
      send<{ data: { staleness: number } }>(r.post('/comparison-staleness/mark').send(body)),
    getStaleness: (query: { mediaType: MediaTypeWire; mediaId: number }) =>
      send<{ data: { staleness: number } }>(r.get('/comparison-staleness').query(query)),
    getTierListMovies: (dimensionId: number) =>
      send<{ data: TierListMovieWire[] }>(r.get(`/tier-list/${dimensionId}`)),
    submitTierList: (body: Record<string, unknown>) =>
      send<{
        data: {
          comparisonsRecorded: number;
          skipped: number;
          scoreChanges: ScoreChangeWire[];
        };
        message: string;
      }>(r.post('/tier-list').send(body)),
  };
}
