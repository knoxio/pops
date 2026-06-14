/**
 * Smoke test that the relocated media schemas (PRD-245 US-04 / audit H6)
 * resolve from `@pops/media-db` with the expected drizzle SQL `name`.
 *
 * Catches "table moved but the export forgot to flip" mistakes during
 * follow-up shuffles. The set MUST cover every table named in
 * `us-04-relocate-media-schemas.md` so a regression on either side
 * trips this file.
 */
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  comparisonDimensions,
  comparisonSkipCooloffs,
  comparisonStaleness,
  comparisons,
  dismissedDiscover,
  episodes,
  mediaScores,
  mediaWatchlist,
  movies,
  rotationCandidates,
  rotationExclusions,
  rotationLog,
  rotationSources,
  seasons,
  shelfImpressions,
  syncJobResults,
  syncLogs,
  tvShows,
  watchHistory,
} from '../schema.js';

describe('PRD-245 US-04 media schema relocation', () => {
  it.each([
    [comparisonDimensions, 'comparison_dimensions'],
    [comparisonSkipCooloffs, 'comparison_skip_cooloffs'],
    [comparisonStaleness, 'comparison_staleness'],
    [comparisons, 'comparisons'],
    [dismissedDiscover, 'dismissed_discover'],
    [episodes, 'episodes'],
    [mediaScores, 'media_scores'],
    [mediaWatchlist, 'watchlist'],
    [movies, 'movies'],
    [rotationCandidates, 'rotation_candidates'],
    [rotationExclusions, 'rotation_exclusions'],
    [rotationLog, 'rotation_log'],
    [rotationSources, 'rotation_sources'],
    [seasons, 'seasons'],
    [shelfImpressions, 'shelf_impressions'],
    [syncJobResults, 'sync_job_results'],
    [syncLogs, 'sync_logs'],
    [tvShows, 'tv_shows'],
    [watchHistory, 'watch_history'],
  ])('resolves %#: %s', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
