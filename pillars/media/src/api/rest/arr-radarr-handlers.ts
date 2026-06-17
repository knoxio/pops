/**
 * Handlers for the Radarr routes of the `arr.*` sub-router (movies +
 * config/queue). Thin wrappers over the env-configured Radarr client in
 * `../clients/arr`; unconfigured services raise `ConflictError` (409) via
 * `requireRadarr`.
 *
 * `downloadAndProtect` creates a POPS library entry via `moviesService` and
 * marks it `protected`. NOTE: the monolith enriched that entry with TMDB
 * metadata (`addMovieToLibrary`) which lives in the library/rotation domain
 * (wave 3); here the column write happens with the data on the request,
 * deferring the metadata enrichment.
 */
import {
  type MediaDb,
  MovieConflictError,
  MovieNotFoundError,
  moviesService,
} from '../../db/index.js';
import {
  clearMovieStatusCache,
  getArrConfig,
  getArrSettings,
  getDownloadQueue,
  getMovieStatus,
  getRotationDefaults,
  testRadarr,
  testRadarrSaved,
} from '../clients/arr/index.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { requireRadarr, type ArrReq } from './arr-handlers-shared.js';
import { runHttp } from './error-mapping.js';

export function makeRadarrHandlers(db: MediaDb) {
  return {
    config: () => runHttp(() => ({ status: 200 as const, body: { data: getArrConfig() } })),

    settings: () =>
      runHttp(() => {
        const s = getArrSettings();
        return {
          status: 200 as const,
          body: {
            data: {
              radarrUrl: s.radarrUrl ?? '',
              radarrConfigured: !!(s.radarrUrl && s.radarrApiKey),
              sonarrUrl: s.sonarrUrl ?? '',
              sonarrConfigured: !!(s.sonarrUrl && s.sonarrApiKey),
            },
          },
        };
      }),

    queue: () =>
      runHttp(async () => ({ status: 200 as const, body: { data: await getDownloadQueue() } })),

    getRadarrQualityProfiles: () =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await requireRadarr().getQualityProfiles() },
      })),

    getRadarrRootFolders: () =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await requireRadarr().getRootFolders() },
      })),

    testRadarr: ({ body }: ArrReq['testRadarr']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await testRadarr(body.url, body.apiKey),
      })),

    testRadarrSaved: () =>
      runHttp(async () => ({ status: 200 as const, body: await testRadarrSaved() })),

    addMovie: ({ body }: ArrReq['addMovie']) =>
      runHttp(async () => {
        const movie = await requireRadarr().addMovie(body);
        clearMovieStatusCache(body.tmdbId);
        return { status: 201 as const, body: { data: movie } };
      }),

    checkMovie: ({ params }: ArrReq['checkMovie']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await requireRadarr().checkMovie(params.tmdbId) },
      })),

    getMovieStatus: ({ params }: ArrReq['getMovieStatus']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await getMovieStatus(params.tmdbId) },
      })),

    updateRadarrMonitoring: ({ params, body }: ArrReq['updateRadarrMonitoring']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await requireRadarr().updateMonitoring(params.radarrId, body.monitored) },
      })),

    triggerRadarrSearch: ({ params }: ArrReq['triggerRadarrSearch']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await requireRadarr().triggerSearch(params.radarrId) },
      })),

    downloadAndProtect: ({ body }: ArrReq['downloadAndProtect']) =>
      runHttp(async () => {
        const client = requireRadarr();
        const defaults = getRotationDefaults();
        if (!defaults) {
          throw new ConflictError(
            'Radarr rotation defaults not configured (RADARR_QUALITY_PROFILE_ID / RADARR_ROOT_FOLDER_PATH)'
          );
        }
        const check = await client.checkMovie(body.tmdbId);
        if (!check.exists) {
          await client.addMovie({
            tmdbId: body.tmdbId,
            title: body.title,
            year: body.year,
            qualityProfileId: defaults.qualityProfileId,
            rootFolderPath: defaults.rootFolderPath,
          });
        }
        clearMovieStatusCache(body.tmdbId);

        const existing = moviesService.getMovieByTmdbId(db, body.tmdbId);
        const movie = existing ?? createProtectedLibraryEntry(db, body);
        moviesService.setRotationStatus(db, movie.id, 'protected');

        return { status: 200 as const, body: { data: { alreadyInRadarr: check.exists } } };
      }),
  };
}

function createProtectedLibraryEntry(
  db: MediaDb,
  input: { tmdbId: number; title: string; year: number }
): moviesService.MovieRow {
  try {
    return moviesService.createMovie(db, {
      tmdbId: input.tmdbId,
      title: input.title,
      releaseDate: `${input.year}-01-01`,
    });
  } catch (err) {
    if (err instanceof MovieConflictError) {
      const existing = moviesService.getMovieByTmdbId(db, input.tmdbId);
      if (existing) return existing;
      throw new ConflictError(err.message);
    }
    if (err instanceof MovieNotFoundError) {
      throw new NotFoundError('Movie', String(input.tmdbId));
    }
    throw err;
  }
}
