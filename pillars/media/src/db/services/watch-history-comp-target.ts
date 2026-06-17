/**
 * Resolve the comparison-staleness target for a watched media item.
 *
 * Comparison scores live at the comparable granularity: a movie is its own
 * target, an episode rolls up to its parent TV show (episode → season →
 * tv_show). The watch-history log/batchLog paths call this on completion to
 * reset the right item's staleness. HTTP-free, `(db, …)`-arg; ported from the
 * monolith `watch-history/handlers/log-watch-event.ts#resolveCompTarget`.
 */
import { eq } from 'drizzle-orm';

import { episodes, seasons } from '../schema.js';

import type { MediaDb } from './internal.js';

export interface ComparisonTarget {
  type: string;
  id: number;
}

export function resolveComparisonTarget(
  db: MediaDb,
  mediaType: string,
  mediaId: number
): ComparisonTarget {
  if (mediaType !== 'episode') return { type: mediaType, id: mediaId };

  const episode = db
    .select({ seasonId: episodes.seasonId })
    .from(episodes)
    .where(eq(episodes.id, mediaId))
    .get();
  if (!episode) return { type: mediaType, id: mediaId };

  const season = db
    .select({ tvShowId: seasons.tvShowId })
    .from(seasons)
    .where(eq(seasons.id, episode.seasonId))
    .get();
  if (!season) return { type: mediaType, id: mediaId };

  return { type: 'tv_show', id: season.tvShowId };
}
