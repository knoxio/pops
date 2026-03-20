/**
 * TheTVDB library service — orchestrates fetching from TheTVDB and
 * upserting into the local database.
 */
import { eq } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { seasons, episodes } from "@pops/db-types";
import * as tvShowsService from "../tv-shows/service.js";
import type { TheTvdbClient } from "./client.js";
import type { TvdbEpisode } from "./types.js";

export interface RefreshTvShowInput {
  id: number;
  redownloadImages?: boolean;
  refreshEpisodes?: boolean;
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
 * Refresh TV show metadata from TheTVDB.
 *
 * - Fetches fresh show detail and updates local record (preserves poster_override_path)
 * - If refreshEpisodes (default true): fetches all season/episode data,
 *   inserts new seasons/episodes, updates existing ones, never deletes
 * - If redownloadImages: re-downloads cached images (stubbed until image cache lands)
 */
export async function refreshTvShow(
  client: TheTvdbClient,
  input: RefreshTvShowInput,
): Promise<RefreshTvShowResult> {
  const { id, redownloadImages = false, refreshEpisodes = true } = input;

  // 1. Get existing show to retrieve tvdbId and poster_override_path
  const existingShow = tvShowsService.getTvShow(id);
  const tvdbId = existingShow.tvdbId;

  // 2. Fetch fresh detail from TheTVDB
  const detail = await client.getSeriesExtended(tvdbId);

  // 3. Update show metadata, preserving poster_override_path
  tvShowsService.updateTvShow(id, {
    name: detail.name,
    originalName: detail.originalName,
    overview: detail.overview,
    firstAirDate: detail.firstAirDate,
    lastAirDate: detail.lastAirDate,
    status: detail.status,
    originalLanguage: detail.originalLanguage,
    episodeRunTime: detail.averageRuntime,
    numberOfSeasons: detail.seasons.length,
    genres: detail.genres.map((g) => g.name),
    networks: detail.networks.map((g) => g.name),
    // Explicitly do NOT update posterOverridePath — preserve user override
  });

  let episodesAdded = 0;
  let episodesUpdated = 0;
  let seasonsAdded = 0;
  let seasonsUpdated = 0;

  // 4. Refresh episodes if requested
  if (refreshEpisodes) {
    const db = getDrizzle();

    for (const seasonSummary of detail.seasons) {
      // Upsert season
      const existingSeason = db
        .select()
        .from(seasons)
        .where(eq(seasons.tvdbId, seasonSummary.tvdbId))
        .get();

      let seasonId: number;

      if (existingSeason) {
        // Update existing season
        db.update(seasons)
          .set({
            name: seasonSummary.name,
            overview: seasonSummary.overview,
            posterPath: seasonSummary.imageUrl,
            episodeCount: seasonSummary.episodeCount,
          })
          .where(eq(seasons.id, existingSeason.id))
          .run();
        seasonId = existingSeason.id;
        seasonsUpdated++;
      } else {
        // Insert new season
        db.insert(seasons)
          .values({
            tvShowId: id,
            tvdbId: seasonSummary.tvdbId,
            seasonNumber: seasonSummary.seasonNumber,
            name: seasonSummary.name,
            overview: seasonSummary.overview,
            posterPath: seasonSummary.imageUrl,
            episodeCount: seasonSummary.episodeCount,
          })
          .run();
        const newSeason = db
          .select()
          .from(seasons)
          .where(eq(seasons.tvdbId, seasonSummary.tvdbId))
          .get();
        if (!newSeason) {
          // Should never happen — we just inserted it
          continue;
        }
        seasonId = newSeason.id;
        seasonsAdded++;
      }

      // Fetch episodes for this season
      let tvdbEpisodes: TvdbEpisode[];
      try {
        tvdbEpisodes = await client.getSeriesEpisodes(
          tvdbId,
          seasonSummary.seasonNumber,
        );
      } catch {
        // Skip seasons where episode fetch fails (e.g., upcoming season with no data)
        continue;
      }

      // Upsert episodes
      for (const ep of tvdbEpisodes) {
        const existingEp = db
          .select()
          .from(episodes)
          .where(eq(episodes.tvdbId, ep.tvdbId))
          .get();

        if (existingEp) {
          // Update existing episode
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
          // Insert new episode
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

  // 5. Re-download images if requested (stubbed — image cache tb-065 in review)
  if (redownloadImages) {
    // TODO: When image cache service lands (tb-065), call:
    // await imageCache.deleteTvShowImages(tvdbId);
    // await imageCache.downloadTvShowImages(tvdbId, posterUrl, backdropUrl);
  }

  // 6. Return updated show with seasons
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
