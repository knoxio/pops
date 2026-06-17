/**
 * Episode watch matching — maps Plex episodes to local DB episodes by
 * season+episode number and logs watch history for watched episodes.
 *
 * Ported from the monolith `sync-helpers.ts` (`syncEpisodeWatches` +
 * `processSingleEpisode`) and converted to the pillar's `(db, …)` pattern.
 */
import { and, eq } from 'drizzle-orm';

import {
  type MediaDb,
  episodes,
  seasons,
  tvShowsService,
  watchHistoryLogService,
} from '../../../../db/index.js';
import { hasNearDuplicateWatch } from './sync-helpers.js';

import type { PlexEpisode } from '../types.js';

/** Per-episode mismatch detail for diagnostics. */
export interface EpisodeMismatch {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}

/** Detailed diagnostics returned by {@link syncEpisodeWatches}. */
export interface EpisodeSyncDiagnostics {
  plexTotal: number;
  plexWatched: number;
  matched: number;
  alreadyLogged: number;
  seasonNotFound: number;
  episodeNotFound: number;
  missingSeasonsPreview: number[];
  missingEpisodesPreview: EpisodeMismatch[];
}

const PREVIEW_LIMIT = 10;

interface ProcessEpisodeContext {
  showId: number;
  diagnostics: EpisodeSyncDiagnostics;
  missingSeasonsSet: Set<number>;
}

function processSingleEpisode(db: MediaDb, plexEp: PlexEpisode, ctx: ProcessEpisodeContext): void {
  const { showId, diagnostics, missingSeasonsSet } = ctx;
  try {
    const season = db
      .select()
      .from(seasons)
      .where(and(eq(seasons.tvShowId, showId), eq(seasons.seasonNumber, plexEp.seasonIndex)))
      .get();
    if (!season) {
      diagnostics.seasonNotFound++;
      missingSeasonsSet.add(plexEp.seasonIndex);
      return;
    }

    const episode = db
      .select()
      .from(episodes)
      .where(and(eq(episodes.seasonId, season.id), eq(episodes.episodeNumber, plexEp.episodeIndex)))
      .get();
    if (!episode) {
      diagnostics.episodeNotFound++;
      if (diagnostics.missingEpisodesPreview.length < PREVIEW_LIMIT) {
        diagnostics.missingEpisodesPreview.push({
          seasonNumber: plexEp.seasonIndex,
          episodeNumber: plexEp.episodeIndex,
          title: plexEp.title,
        });
      }
      return;
    }

    const episodeWatchedAt = plexEp.lastViewedAt
      ? new Date(plexEp.lastViewedAt * 1000).toISOString()
      : new Date().toISOString();

    if (hasNearDuplicateWatch(db, 'episode', episode.id, episodeWatchedAt)) {
      diagnostics.alreadyLogged++;
      return;
    }

    const result = watchHistoryLogService.logWatch(db, {
      mediaType: 'episode',
      mediaId: episode.id,
      watchedAt: episodeWatchedAt,
      completed: 1,
      source: 'plex_sync',
    });

    if (result.created) diagnostics.matched++;
    else diagnostics.alreadyLogged++;
  } catch {
    diagnostics.alreadyLogged++;
  }
}

function emptyDiagnostics(plexTotal: number): EpisodeSyncDiagnostics {
  return {
    plexTotal,
    plexWatched: 0,
    matched: 0,
    alreadyLogged: 0,
    seasonNotFound: 0,
    episodeNotFound: 0,
    missingSeasonsPreview: [],
    missingEpisodesPreview: [],
  };
}

/**
 * Match Plex episodes to local DB episodes and log watch history for watched
 * episodes. Returns diagnostics about what matched, was skipped, and why.
 */
export function syncEpisodeWatches(
  db: MediaDb,
  tvdbId: number,
  plexEpisodes: PlexEpisode[]
): EpisodeSyncDiagnostics {
  const diagnostics = emptyDiagnostics(plexEpisodes.length);
  const show = tvShowsService.getTvShowByTvdbId(db, tvdbId);
  if (!show) return diagnostics;

  const missingSeasonsSet = new Set<number>();
  const ctx: ProcessEpisodeContext = { showId: show.id, diagnostics, missingSeasonsSet };

  for (const plexEp of plexEpisodes) {
    if (plexEp.viewCount === 0) continue;
    diagnostics.plexWatched++;
    processSingleEpisode(db, plexEp, ctx);
  }

  diagnostics.missingSeasonsPreview = [...missingSeasonsSet].slice(0, PREVIEW_LIMIT);
  return diagnostics;
}
