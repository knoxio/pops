/**
 * `autoRemoveTvShowIfFullyWatched` — extracted from `./log-watch-event.ts`
 * to keep that file under the max-lines cap. Shared by both the logWatch
 * episode handler and `./batch-operations.ts` (re-exported there via the
 * `logWatchEvent` barrel).
 *
 * Runs inside an existing `getMediaDrizzle().transaction(...)` — the caller
 * passes the tx in. Deletes the matching `mediaWatchlist` row when every
 * episode of the show has been completed.
 */
import { and, countDistinct, eq, inArray } from 'drizzle-orm';

import { episodes, mediaWatchlist, seasons, watchHistory } from '@pops/media-db';

import type { MediaDb } from '@pops/media-db';

type Tx = Parameters<Parameters<MediaDb['transaction']>[0]>[0];

export function autoRemoveTvShowIfFullyWatched(tx: Tx, episodeId: number): boolean {
  const episode = tx
    .select({ seasonId: episodes.seasonId })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .get();
  if (!episode) return false;

  const season = tx
    .select({ tvShowId: seasons.tvShowId })
    .from(seasons)
    .where(eq(seasons.id, episode.seasonId))
    .get();
  if (!season) return false;

  const tvShowId = season.tvShowId;
  const showEpisodeIds = tx
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .all()
    .map((r) => r.id);

  if (showEpisodeIds.length === 0) return false;

  const watchedRow = tx
    .select({ watched: countDistinct(watchHistory.mediaId) })
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, 'episode'),
        eq(watchHistory.completed, 1),
        inArray(watchHistory.mediaId, showEpisodeIds)
      )
    )
    .all()[0];
  const watched = watchedRow?.watched ?? 0;

  if (watched >= showEpisodeIds.length) {
    const deleteResult = tx
      .delete(mediaWatchlist)
      .where(and(eq(mediaWatchlist.mediaType, 'tv_show'), eq(mediaWatchlist.mediaId, tvShowId)))
      .run();
    return deleteResult.changes > 0;
  }
  return false;
}
