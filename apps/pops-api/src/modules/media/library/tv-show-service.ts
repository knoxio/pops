/**
 * Add TV show to library — fetches TheTVDB metadata and inserts
 * show + seasons + episodes in a single transaction.
 */
import { eq } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { tvShows, seasons, episodes } from "@pops/db-types";
import type { TvShowRow, SeasonRow } from "@pops/db-types";
import type { TheTvdbClient } from "../thetvdb/client.js";
import type { TvdbArtwork, TvdbEpisode } from "../thetvdb/types.js";
import type { ImageCacheService } from "../tmdb/image-cache.js";
import { getTvShowByTvdbId } from "../tv-shows/service.js";

export interface AddTvShowResult {
  show: TvShowRow;
  seasons: SeasonRow[];
  created: boolean;
}

/**
 * Add a TV show to the local library by TVDB ID.
 *
 * - Idempotent: returns existing show if already in library.
 * - Fetches full detail + episodes from TheTVDB.
 * - Inserts show, seasons, and episodes in a single transaction.
 */
export async function addTvShow(
  tvdbId: number,
  client: TheTvdbClient,
  imageCache?: ImageCacheService
): Promise<AddTvShowResult> {
  // Check for existing show (idempotent)
  const existing = getTvShowByTvdbId(tvdbId);
  if (existing) {
    const db = getDrizzle();
    const showSeasons = db.select().from(seasons).where(eq(seasons.tvShowId, existing.id)).all();
    return { show: existing, seasons: showSeasons, created: false };
  }

  // Fetch show detail from TheTVDB
  const detail = await client.getSeriesExtended(tvdbId);

  // Fetch episodes for all seasons concurrently
  const seasonEpisodes = new Map<number, TvdbEpisode[]>();
  const episodeResults = await Promise.all(
    detail.seasons.map(async (season) => {
      const eps = await client.getSeriesEpisodes(tvdbId, season.seasonNumber);
      return { seasonNumber: season.seasonNumber, eps };
    })
  );
  for (const { seasonNumber, eps } of episodeResults) {
    seasonEpisodes.set(seasonNumber, eps);
  }

  // Select best artwork
  const { posterUrl, backdropUrl } = selectBestArtwork(detail.artworks);

  // Insert in a single transaction (re-check for race condition inside tx)
  const db = getDrizzle();
  const now = new Date().toISOString();

  const result = db.transaction((tx) => {
    // Re-check inside transaction to prevent race condition
    const raceCheck = tx.select().from(tvShows).where(eq(tvShows.tvdbId, detail.tvdbId)).get();
    if (raceCheck) {
      const showSeasons = tx.select().from(seasons).where(eq(seasons.tvShowId, raceCheck.id)).all();
      return { show: raceCheck, seasons: showSeasons, created: false as const };
    }

    // Count total episodes across all seasons
    let totalEpisodes = 0;
    for (const eps of seasonEpisodes.values()) {
      totalEpisodes += eps.length;
    }

    // Insert show
    const showResult = tx
      .insert(tvShows)
      .values({
        tvdbId: detail.tvdbId,
        name: detail.name,
        originalName: detail.originalName,
        overview: detail.overview,
        firstAirDate: detail.firstAirDate,
        lastAirDate: detail.lastAirDate,
        status: detail.status,
        originalLanguage: detail.originalLanguage,
        numberOfSeasons: detail.seasons.filter((s) => s.seasonNumber > 0).length,
        numberOfEpisodes: totalEpisodes,
        episodeRunTime: detail.averageRuntime,
        posterPath: posterUrl,
        backdropPath: backdropUrl,
        genres: detail.genres.length > 0 ? JSON.stringify(detail.genres.map((g) => g.name)) : null,
        networks:
          detail.networks.length > 0 ? JSON.stringify(detail.networks.map((n) => n.name)) : null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const showId = Number(showResult.lastInsertRowid);

    // Insert seasons and episodes
    const insertedSeasons: SeasonRow[] = [];

    for (const season of detail.seasons) {
      const seasonResult = tx
        .insert(seasons)
        .values({
          tvShowId: showId,
          tvdbId: season.tvdbId,
          seasonNumber: season.seasonNumber,
          name: season.name,
          overview: season.overview,
          posterPath: season.imageUrl,
          episodeCount: season.episodeCount,
        })
        .run();

      const seasonId = Number(seasonResult.lastInsertRowid);
      const seasonRow = tx.select().from(seasons).where(eq(seasons.id, seasonId)).get();
      if (!seasonRow) throw new Error(`Season ${seasonId} not found after insert`);
      insertedSeasons.push(seasonRow);

      // Insert episodes for this season
      const eps = seasonEpisodes.get(season.seasonNumber) ?? [];
      for (const ep of eps) {
        tx.insert(episodes)
          .values({
            seasonId,
            tvdbId: ep.tvdbId,
            episodeNumber: ep.episodeNumber,
            name: ep.name,
            overview: ep.overview,
            airDate: ep.airDate,
            runtime: ep.runtime,
            stillPath: ep.imageUrl,
          })
          .run();
      }
    }

    // Re-fetch the show to get all columns
    const showRow = tx.select().from(tvShows).where(eq(tvShows.id, showId)).get();
    if (!showRow) throw new Error(`TV show ${showId} not found after insert`);

    return { show: showRow, seasons: insertedSeasons, created: true as const };
  });

  // Download images to local cache (non-blocking — failures are logged)
  if (result.created && imageCache) {
    imageCache
      .downloadTvShowImages(tvdbId, posterUrl, backdropUrl)
      .catch((err) =>
        console.warn(
          `[addTvShow] Image download failed for tvdbId ${tvdbId}: ${err instanceof Error ? err.message : String(err)}`
        )
      );
  }

  return result;
}

/** Select the best poster and backdrop from TheTVDB artworks. */
export function selectBestArtwork(artworks: TvdbArtwork[]): {
  posterUrl: string | null;
  backdropUrl: string | null;
} {
  const posterUrl = pickBest(artworks, 2);
  const backdropUrl = pickBest(artworks, 3);
  return { posterUrl, backdropUrl };
}

function pickBest(artworks: TvdbArtwork[], type: number): string | null {
  const candidates = artworks.filter((a) => a.type === type);
  if (candidates.length === 0) return null;

  // Prefer English, then highest score
  const sorted = [...candidates].sort((a, b) => {
    const aEng = a.language === "eng" ? 1 : 0;
    const bEng = b.language === "eng" ? 1 : 0;
    if (aEng !== bEng) return bEng - aEng;
    return b.score - a.score;
  });

  return sorted[0]?.imageUrl ?? null;
}
