/**
 * TheTVDB library service — orchestrates fetching from TheTVDB and
 * upserting into the local database.
 */
import { eq } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { seasons, episodes } from "@pops/db-types";
import * as tvShowsService from "../tv-shows/service.js";
import type { TheTvdbClient } from "./client.js";
import type { TvdbEpisode, TvdbSeasonSummary } from "./types.js";
import type { ImageCacheService } from "../tmdb/image-cache.js";
import { selectBestArtwork } from "../library/tv-show-service.js";

export interface RefreshTvShowInput {
  id: number;
  redownloadImages?: boolean;
  refreshEpisodes?: boolean;
  imageCache?: ImageCacheService;
}

export interface RefreshTvShowResult {
  show: ReturnType<typeof tvShowsService.getTvShow>;
  seasons: ReturnType<typeof tvShowsService.listSeasons>["rows"];
  episodesAdded: number;
  episodesUpdated: number;
  seasonsAdded: number;
  seasonsUpdated: number;
}

/**
 * Upsert a season row — insert if new, update if existing.
 * Returns the local season ID and whether it was newly added.
 */
function upsertSeason(
  showId: number,
  seasonSummary: TvdbSeasonSummary
): { seasonId: number; added: boolean } {
  const db = getDrizzle();
  const existing = db.select().from(seasons).where(eq(seasons.tvdbId, seasonSummary.tvdbId)).get();

  if (existing) {
    db.update(seasons)
      .set({
        name: seasonSummary.name,
        overview: seasonSummary.overview,
        posterPath: seasonSummary.imageUrl,
        episodeCount: seasonSummary.episodeCount,
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
      episodeCount: seasonSummary.episodeCount,
    })
    .run();

  const newSeason = db.select().from(seasons).where(eq(seasons.tvdbId, seasonSummary.tvdbId)).get();

  if (!newSeason) {
    throw new Error(`Failed to insert season with tvdbId ${seasonSummary.tvdbId}`);
  }

  return { seasonId: newSeason.id, added: true };
}

/**
 * Refresh TV show metadata from TheTVDB.
 *
 * - Fetches fresh show detail and updates local record (preserves poster_override_path)
 * - Always upserts seasons from show detail
 * - If refreshEpisodes (default true): also fetches and upserts episode data
 * - If redownloadImages: re-downloads cached images (stubbed until image cache lands)
 */
export async function refreshTvShow(
  client: TheTvdbClient,
  input: RefreshTvShowInput
): Promise<RefreshTvShowResult> {
  const { id, redownloadImages = false, refreshEpisodes = true, imageCache } = input;

  // 1. Get existing show to retrieve tvdbId
  const existingShow = tvShowsService.getTvShow(id);
  const tvdbId = existingShow.tvdbId;

  // 2. Fetch fresh detail from TheTVDB
  const detail = await client.getSeriesExtended(tvdbId);

  // 3. Update show metadata, preserving poster_override_path
  // Exclude specials (season 0) from numberOfSeasons count
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
    // Explicitly do NOT update posterOverridePath — preserve user override
  });

  let episodesAdded = 0;
  let episodesUpdated = 0;
  let seasonsAdded = 0;
  let seasonsUpdated = 0;

  // 4. Always upsert seasons from show detail
  const seasonIdMap = new Map<number, number>();

  for (const seasonSummary of detail.seasons) {
    const { seasonId, added } = upsertSeason(id, seasonSummary);
    seasonIdMap.set(seasonSummary.seasonNumber, seasonId);
    if (added) {
      seasonsAdded++;
    } else {
      seasonsUpdated++;
    }
  }

  // 5. Refresh episodes if requested
  if (refreshEpisodes) {
    const db = getDrizzle();

    for (const seasonSummary of detail.seasons) {
      const seasonId = seasonIdMap.get(seasonSummary.seasonNumber);
      if (seasonId === undefined) continue;

      // Fetch episodes for this season
      let tvdbEpisodes: TvdbEpisode[];
      try {
        tvdbEpisodes = await client.getSeriesEpisodes(tvdbId, seasonSummary.seasonNumber);
      } catch {
        // Skip seasons where episode fetch fails (e.g., upcoming season with no data)
        continue;
      }

      // Upsert episodes — insert new, update existing, never delete
      for (const ep of tvdbEpisodes) {
        const existingEp = db.select().from(episodes).where(eq(episodes.tvdbId, ep.tvdbId)).get();

        if (existingEp) {
          db.update(episodes)
            .set({
              name: ep.name,
              overview: ep.overview,
              airDate: ep.airDate,
              runtime: ep.runtime,
              episodeNumber: ep.episodeNumber,
            })
            .where(eq(episodes.id, existingEp.id))
            .run();
          episodesUpdated++;
        } else {
          db.insert(episodes)
            .values({
              seasonId,
              tvdbId: ep.tvdbId,
              episodeNumber: ep.episodeNumber,
              name: ep.name,
              overview: ep.overview,
              airDate: ep.airDate,
              runtime: ep.runtime,
            })
            .run();
          episodesAdded++;
        }
      }
    }

    // Update numberOfEpisodes on the show
    const totalEpisodes = db
      .select()
      .from(episodes)
      .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
      .where(eq(seasons.tvShowId, id))
      .all().length;

    tvShowsService.updateTvShow(id, { numberOfEpisodes: totalEpisodes });
  }

  // 6. Re-download images if requested
  if (redownloadImages && imageCache) {
    const { posterUrl, backdropUrl } = selectBestArtwork(detail.artworks);
    const seasonPosters = detail.seasons
      .filter((s) => s.imageUrl != null)
      .map((s) => ({ seasonNumber: s.seasonNumber, posterUrl: s.imageUrl }));

    await imageCache.deleteTvShowImages(tvdbId);
    await imageCache.downloadTvShowImages(tvdbId, posterUrl, backdropUrl, seasonPosters);
  }

  // 7. Return updated show with seasons
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
