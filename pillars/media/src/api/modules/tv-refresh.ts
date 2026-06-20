/**
 * TheTVDB refresh use-case service — `refreshTvShow`.
 *
 * Ported from the monolith `thetvdb/{service,refresh-episodes}.ts`, repointed
 * onto the pillar's `(db, …)` db services (the season/episode upserts now live
 * in `seasonsService` / `episodesService`). Refreshes show metadata, upserts
 * seasons, optionally upserts every season's episodes, and optionally
 * re-downloads cached images.
 */
import {
  type MediaDb,
  type SeasonRow,
  type TvShowRow,
  episodesService,
  seasonsService,
  tvShowsService,
} from '../../db/index.js';
import { selectBestArtwork } from './tv-ingest.js';

import type { TheTvdbClient } from '../clients/thetvdb/index.js';
import type { TvdbShowDetail } from '../clients/thetvdb/types.js';
import type { ImageCacheService } from '../clients/tmdb/image-cache.js';

export interface RefreshTvShowInput {
  id: number;
  redownloadImages?: boolean;
  refreshEpisodes?: boolean;
}

export interface RefreshTvShowResult {
  show: TvShowRow;
  seasons: SeasonRow[];
  episodesAdded: number;
  episodesUpdated: number;
  seasonsAdded: number;
  seasonsUpdated: number;
}

function updateShowMetadata(db: MediaDb, id: number, detail: TvdbShowDetail): void {
  tvShowsService.updateTvShow(db, id, {
    name: detail.name,
    originalName: detail.originalName,
    overview: detail.overview,
    firstAirDate: detail.firstAirDate,
    lastAirDate: detail.lastAirDate,
    status: detail.status,
    originalLanguage: detail.originalLanguage,
    episodeRunTime: detail.averageRuntime,
    numberOfSeasons: detail.seasons.filter((s) => s.seasonNumber > 0).length,
    genres: detail.genres.map((g) => g.name),
    networks: detail.networks.map((n) => n.name),
  });
}

interface SeasonsUpsertOutcome {
  seasonIdMap: Map<number, number>;
  seasonsAdded: number;
  seasonsUpdated: number;
}

function upsertAllSeasons(db: MediaDb, id: number, detail: TvdbShowDetail): SeasonsUpsertOutcome {
  const seasonIdMap = new Map<number, number>();
  let seasonsAdded = 0;
  let seasonsUpdated = 0;
  for (const summary of detail.seasons) {
    const { seasonId, added } = seasonsService.upsertSeasonByTvdbId(db, {
      tvShowId: id,
      tvdbId: summary.tvdbId,
      seasonNumber: summary.seasonNumber,
      name: summary.name,
      overview: summary.overview,
      posterPath: summary.imageUrl,
      episodeCount: summary.episodeCount || null,
    });
    seasonIdMap.set(summary.seasonNumber, seasonId);
    if (added) seasonsAdded++;
    else seasonsUpdated++;
  }
  return { seasonIdMap, seasonsAdded, seasonsUpdated };
}

interface EpisodeRefreshArgs {
  db: MediaDb;
  client: TheTvdbClient;
  tvdbId: number;
  showId: number;
  detail: TvdbShowDetail;
  seasonIdMap: Map<number, number>;
}

async function refreshAllEpisodes(
  args: EpisodeRefreshArgs
): Promise<{ episodesAdded: number; episodesUpdated: number }> {
  const { db, client, tvdbId, showId, detail, seasonIdMap } = args;
  let added = 0;
  let updated = 0;

  for (const summary of detail.seasons) {
    const seasonId = seasonIdMap.get(summary.seasonNumber);
    if (seasonId === undefined) continue;
    let eps;
    try {
      eps = await client.getSeriesEpisodes(tvdbId, summary.seasonNumber);
    } catch {
      continue;
    }
    for (const ep of eps) {
      const { added: wasAdded } = episodesService.upsertEpisodeByTvdbId(db, {
        seasonId,
        tvdbId: ep.tvdbId,
        episodeNumber: ep.episodeNumber,
        name: ep.name,
        overview: ep.overview,
        airDate: ep.airDate,
        runtime: ep.runtime,
      });
      if (wasAdded) added++;
      else updated++;
    }
    seasonsService.setSeasonEpisodeCount(db, seasonId, eps.length);
  }

  tvShowsService.updateTvShow(db, showId, {
    numberOfEpisodes: episodesService.countShowEpisodes(db, showId),
  });
  return { episodesAdded: added, episodesUpdated: updated };
}

async function redownloadShowImages(
  tvdbId: number,
  detail: TvdbShowDetail,
  imageCache: ImageCacheService
): Promise<void> {
  const { posterUrl, backdropUrl } = selectBestArtwork(detail.artworks);
  const seasonPosters = detail.seasons
    .filter((s) => s.imageUrl != null)
    .map((s) => ({ seasonNumber: s.seasonNumber, posterUrl: s.imageUrl }));
  await imageCache.deleteTvShowImages(tvdbId);
  await imageCache.downloadTvShowImages({ tvdbId, posterUrl, backdropUrl, seasonPosters });
}

/**
 * Refresh TV show metadata from TheTVDB.
 *
 * - Updates the local show record (db layer preserves the poster override).
 * - Always upserts seasons from the show detail.
 * - When `refreshEpisodes` (default true): also fetches + upserts episodes.
 * - When `redownloadImages` (default false): re-downloads cached images.
 */
export async function refreshTvShow(
  db: MediaDb,
  client: TheTvdbClient,
  imageCache: ImageCacheService,
  input: RefreshTvShowInput
): Promise<RefreshTvShowResult> {
  const { id, redownloadImages = false, refreshEpisodes = true } = input;
  const existingShow = tvShowsService.getTvShow(db, id);
  const tvdbId = existingShow.tvdbId;
  const detail = await client.getSeriesExtended(tvdbId);

  updateShowMetadata(db, id, detail);
  const { seasonIdMap, seasonsAdded, seasonsUpdated } = upsertAllSeasons(db, id, detail);

  let episodesAdded = 0;
  let episodesUpdated = 0;
  if (refreshEpisodes) {
    const outcome = await refreshAllEpisodes({
      db,
      client,
      tvdbId,
      showId: id,
      detail,
      seasonIdMap,
    });
    episodesAdded = outcome.episodesAdded;
    episodesUpdated = outcome.episodesUpdated;
  }

  if (redownloadImages) await redownloadShowImages(tvdbId, detail, imageCache);

  return {
    show: tvShowsService.getTvShow(db, id),
    seasons: seasonsService.listSeasons(db, id).rows,
    episodesAdded,
    episodesUpdated,
    seasonsAdded,
    seasonsUpdated,
  };
}
