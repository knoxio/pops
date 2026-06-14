/**
 * Media pillar handle smoke harness.
 *
 * Opens a fresh per-pillar `media.db` via `openMediaDb(':memory:')`
 * and exercises every query under `appRouter.media.*`. Catches
 * `SqliteError: no such table` for cutovers that resolve through
 * `getMediaDrizzle()`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '@pops/media-db';

import { closeDb, setDb } from '../../../db.js';
import { setMediaDb } from '../../../db/media-db-handle.js';
import { appRouter } from '../../../router.js';
import {
  enumeratePillarQueries,
  runPillarSmokeHarness,
  type PillarSmokeInputs,
} from '../../../shared/pillar-smoke-harness.js';
import { createCaller, createTestDb } from '../../../shared/test-utils.js';

/**
 * Procedures that read via the shared `getDrizzle()` (NOT
 * `getMediaDrizzle()`) and touch tables the simplified `createTestDb()`
 * fixture doesn't carry. Adding those tables to the fixture would ripple
 * through dozens of unrelated suites; the smoke harness is only meant
 * to guard the per-pillar handle path, so we explicitly ignore them.
 *
 * Each entry MUST cite the table + reason so a future cutover-to-pillar
 * removes the entry once the call resolves via `getMediaDrizzle()`.
 */
const MEDIA_IGNORE = new Set<string>([
  // `sync_job_results` lives on shared, not in createTestDb. Pillar
  // handle not involved.
  'media.plex.getLastSyncResults',
]);

const MEDIA_INPUTS: PillarSmokeInputs = {
  'media.movies.get': { id: 1 },
  'media.tvShows.get': { id: 1 },
  'media.tvShows.listSeasons': { tvShowId: 1 },
  'media.tvShows.listEpisodes': { seasonId: 1 },
  'media.comparisons.listForMedia': { mediaType: 'movie', mediaId: 1 },
  'media.comparisons.getSmartPair': { dimensionId: 1 },
  'media.comparisons.scores': { dimensionId: 1 },
  'media.comparisons.rankings': { dimensionId: 1 },
  'media.comparisons.getStaleness': { mediaType: 'movie', mediaId: 1 },
  'media.comparisons.getDebriefOpponent': { mediaType: 'movie', mediaId: 1, dimensionId: 1 },
  'media.comparisons.getTierListMovies': { dimensionId: 1 },
  'media.comparisons.getDebrief': { sessionId: 1 },
  'media.watchlist.status': { mediaType: 'movie', mediaId: 1 },
  'media.watchlist.get': { id: 1 },
  'media.watchHistory.get': { id: 1 },
  'media.watchHistory.progress': { tvShowId: 1 },
  'media.watchHistory.batchProgress': { tvShowIds: [1] },
  'media.search.movies': { query: 'smoke' },
  'media.search.tvShows': { query: 'smoke' },
  'media.discovery.profile': { mediaType: 'movie' },
  'media.discovery.quickPick': {},
  'media.discovery.contextPicks': {},
  'media.discovery.genreSpotlight': {},
  'media.discovery.genreSpotlightPage': { genreId: 18, page: 2 },
  'media.discovery.getShelfPage': { shelfId: 'trending' },
  'media.arr.checkMovie': { tmdbId: 1 },
  'media.arr.getMovieStatus': { tmdbId: 1 },
  'media.arr.getSeriesEpisodes': { seriesId: 1 },
  'media.arr.getShowStatus': { tvdbId: 1 },
  'media.arr.checkSeries': { tvdbId: 1 },
  'media.plex.getSyncJobStatus': { jobId: 'nonexistent' },
  'media.rotation.getCandidateStatus': { tmdbId: 1 },
  'media.rotation.listCandidates': {},
};

let mediaHandle: OpenedMediaDb | null = null;

beforeEach(() => {
  setDb(createTestDb());
  mediaHandle = openMediaDb(':memory:');
  setMediaDb(mediaHandle);
});

afterEach(() => {
  setMediaDb(null);
  mediaHandle?.raw.close();
  mediaHandle = null;
  closeDb();
});

describe('media pillar handle smoke harness', () => {
  it('enumerates at least one media query procedure (sanity)', () => {
    const queries = enumeratePillarQueries(appRouter, 'media');
    expect(queries.length).toBeGreaterThan(0);
  });

  it('every media query reaches its table on a fresh per-pillar DB', async () => {
    const caller = createCaller(true);
    const failures = await runPillarSmokeHarness(appRouter, caller, 'media', {
      inputs: MEDIA_INPUTS,
      ignorePaths: MEDIA_IGNORE,
    });

    if (failures.length > 0) {
      const detail = failures.map((f) => `  - ${f.path}: ${f.message}`).join('\n');
      throw new Error(
        `Media pillar smoke harness found ${failures.length.toString()} ` +
          `"no such table" failure(s). The fresh per-pillar media.db is ` +
          `missing one or more tables that these procedures expect:\n${detail}`
      );
    }

    expect(failures).toEqual([]);
  });

  it('runs the entire media smoke pass quickly (<5s)', async () => {
    const caller = createCaller(true);
    const started = Date.now();
    await runPillarSmokeHarness(appRouter, caller, 'media', {
      inputs: MEDIA_INPUTS,
      ignorePaths: MEDIA_IGNORE,
    });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(5000);
  });
});
