import { eq } from 'drizzle-orm';

/**
 * Shared helpers for building Sets of TMDB IDs used by discovery services
 * to filter and annotate DiscoverResult objects.
 *
 * `getDismissedTmdbIds` reads from `media.db.dismissed_discover` via
 * `dismissedDiscoverService` after PRD-170 PR 3 cut both the dismiss
 * writers (`./service.ts`) and this single dismiss-pile reader to the
 * per-pillar handle. The other two helpers stay on `getDrizzle()` while
 * their backing tables (`mediaWatchlist`, `watchHistory`, `movies`) are
 * still pinned to the shared journal — flipping them belongs with each
 * table's own slice cutover, not this dismiss-pile move.
 */
import { mediaWatchlist, movies, watchHistory } from '@pops/db-types';
import { dismissedDiscoverService } from '@pops/media-db';

import { getDrizzle } from '../../../db.js';
import { getMediaDrizzle } from '../../../db/media-db-handle.js';

/** Build a Set of TMDB IDs the user has watched (any entry in watch_history). */
export function getWatchedTmdbIds(): Set<number> {
  const db = getDrizzle();
  const rows = db
    .select({ tmdbId: movies.tmdbId })
    .from(watchHistory)
    .innerJoin(movies, eq(movies.id, watchHistory.mediaId))
    .where(eq(watchHistory.mediaType, 'movie'))
    .all();
  return new Set(rows.map((r) => r.tmdbId));
}

/** Build a Set of TMDB IDs currently on the user's watchlist. */
export function getWatchlistTmdbIds(): Set<number> {
  const db = getDrizzle();
  const rows = db
    .select({ tmdbId: movies.tmdbId })
    .from(mediaWatchlist)
    .innerJoin(movies, eq(movies.id, mediaWatchlist.mediaId))
    .where(eq(mediaWatchlist.mediaType, 'movie'))
    .all();
  return new Set(rows.map((r) => r.tmdbId));
}

/**
 * Build a Set of dismissed TMDB IDs from `media.db.dismissed_discover`
 * via `dismissedDiscoverService` (PRD-170 PR 3). The package guarantees
 * the table exists once `openMediaDb()` has run its baseline migration,
 * so the legacy table-missing fallback that the raw-SQL implementation
 * needed is no longer necessary.
 */
export function getDismissedTmdbIds(): Set<number> {
  return dismissedDiscoverService.getDismissedTmdbIdSet(getMediaDrizzle());
}
