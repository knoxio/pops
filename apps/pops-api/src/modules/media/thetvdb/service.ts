import { eq } from 'drizzle-orm';

/**
 * TheTVDB library service — orchestrates fetching from TheTVDB and
 * upserting into the local database.
 *
 * Implementation is split across:
 *  - `refresh-episodes.ts` — episode upsert + season episode-count update
 */
import { seasons } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { selectBestArtwork } from '../library/tv-show-service.js';
import * as tvShowsService from '../tv-shows/service.js';
import { refreshEpisodesForAllSeasons } from './refresh-episodes.js';

import type { ImageCacheService } from '../tmdb/image-cache.js';
import type { TheTvdbClient } from './client.js';
import type { TvdbSeasonSummary } from './types.js';

export interface RefreshTvShowInput {
  id: number;
  redownloadImages?: boolean;
  refreshEpisodes?: boolean;
  imageCache?: ImageCacheService;
}

export interface RefreshTvShowResult {
  show: ReturnType<typeof tvShowsService.getTvShow>;
  seasons: ReturnType<typeof tvShowsService.listSeasons>['rows'];
  episodesAdded: number;
  episodesUpdated: number;
  seasonsAdded: number;
  seasonsUpdated: number;
}

/**
 * Upsert a season row — insert if new, update if existing.
 */
function upsertSeason(
  showId: number,
  seasonSummary: TvdbSeasonSummary
): { seasonId: number; added: boolean } {
  const db = getDrizzle();
  const existing = db.select().from(seasons).where(eq(seasons.tvdbId, seasonSummary.tvdbId)).get();
  const episodeCount = seasonSummary.episodeCount || null;

  if (existing) {
    db.update(seasons)
      .set({
        name: seasonSummary.name,
        overview: seasonSummary.overview,
        posterPath: seasonSummary.imageUrl,
        ...(episodeCount != null ? { episodeCount } : {}),
      })
      .where(eq(seasons.id, existing.id))
      .run();
    return { seasonId: existing.id, added: false };
  }

  db.insert(seasons)
    .values({
      tvShowId: showId,
      tvdbId: seasonSummary.tvdbId,
      seasonNumber: seasonSummary.seasonNumber,
      name: seasonSummary.name,
      overview: seasonSummary.overview,
      posterPath: seasonSummary.imageUrl,
      episodeCount,
    })
    .run();

  const newSeason = db.select().from(seasons).where(eq(seasons.tvdbId, seasonSummary.tvdbId)).get();
  if (!newSeason) {
    throw new Error(`Failed to insert season with tvdbId ${seasonSummary.tvdbId}`);
  }
  return { seasonId: newSeason.id, added: true };
}

function updateShowMetadata(
  id: number,
  detail: Awaited<ReturnType<TheTvdbClient['getSeriesExtended']>>
): void {
  const regularSeasonCount = detail.seasons.filter((s) => s.seasonNumber > 0).length;
  tvShowsService.updateTvShow(id, {
    name: detail.name,
    originalName: detail.originalName,
    overview: detail.overview,
    firstAirDate: detail.firstAirDate,
    lastAirDate: detail.lastAirDate,
    status: detail.status,
    originalLanguage: detail.originalLanguage,
    episodeRunTime: detail.averageRuntime,
    numberOfSeasons: regularSeasonCount,
    genres: detail.genres.map((g) => g.name),
    networks: detail.networks.map((g) => g.name),
  });
}

interface SeasonsUpsertOutcome {
  seasonIdMap: Map<number, number>;
  seasonsAdded: number;
  seasonsUpdated: number;
}

function upsertAllSeasons(id: number, summaries: TvdbSeasonSummary[]): SeasonsUpsertOutcome {
  const seasonIdMap = new Map<number, number>();
  let seasonsAdded = 0;
  let seasonsUpdated = 0;
  for (const seasonSummary of summaries) {
    const { seasonId, added } = upsertSeason(id, seasonSummary);
    seasonIdMap.set(seasonSummary.seasonNumber, seasonId);
    if (added) seasonsAdded++;
    else seasonsUpdated++;
  }
  return { seasonIdMap, seasonsAdded, seasonsUpdated };
}

async function redownloadShowImages(
  tvdbId: number,
  detail: Awaited<ReturnType<TheTvdbClient['getSeriesExtended']>>,
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
 * - Fetches fresh show detail and updates local record (preserves poster_override_path)
 * - Always upserts seasons from show detail
 * - If refreshEpisodes (default true): also fetches and upserts episode data
 * - If redownloadImages: re-downloads cached images
 */
export async function refreshTvShow(
  client: TheTvdbClient,
  input: RefreshTvShowInput
): Promise<RefreshTvShowResult> {
  const { id, redownloadImages = false, refreshEpisodes = true, imageCache } = input;
  const existingShow = tvShowsService.getTvShow(id);
  const tvdbId = existingShow.tvdbId;
  const detail = await client.getSeriesExtended(tvdbId);

  updateShowMetadata(id, detail);
  const { seasonIdMap, seasonsAdded, seasonsUpdated } = upsertAllSeasons(id, detail.seasons);

  let episodesAdded = 0;
  let episodesUpdated = 0;
  if (refreshEpisodes) {
    const outcome = await refreshEpisodesForAllSeasons({
      client,
      tvdbId,
      showId: id,
      detail,
      seasonIdMap,
    });
    episodesAdded = outcome.episodesAdded;
    episodesUpdated = outcome.episodesUpdated;
  }

  if (redownloadImages && imageCache) {
    await redownloadShowImages(tvdbId, detail, imageCache);
  }

  const updatedShow = tvShowsService.getTvShow(id);
  const updatedSeasons = tvShowsService.listSeasons(id);
  return {
    show: updatedShow,
    seasons: updatedSeasons.rows,
    episodesAdded,
    episodesUpdated,
    seasonsAdded,
    seasonsUpdated,
  };
}
