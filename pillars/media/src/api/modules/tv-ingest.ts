/**
 * TV-show ingestion use-case service — `addTvShow`.
 *
 * Ported from the monolith `library/tv-show-service.ts`, repointed onto the
 * pillar's `(db, …)` db services. Inserts show + seasons + episodes in a
 * single transaction so a crash mid-ingest can't leave a parent `tv_shows`
 * row without its `seasons` / `episodes` children. Image downloads are
 * best-effort and fire after the transaction commits.
 */
import {
  type CreateTvShowInput,
  type MediaDb,
  type SeasonRow,
  type TvShowRow,
  episodesService,
  seasonsService,
  tvShowsService,
} from '../../db/index.js';

import type { TheTvdbClient } from '../clients/thetvdb/index.js';
import type { TvdbArtwork, TvdbEpisode, TvdbShowDetail } from '../clients/thetvdb/types.js';
import type { ImageCacheService } from '../clients/tmdb/image-cache.js';

/** Outcome of {@link addTvShow} — the show, its seasons, and the created flag. */
export interface AddTvShowResult {
  show: TvShowRow;
  seasons: SeasonRow[];
  created: boolean;
}

function pickBest(artworks: TvdbArtwork[], type: number): string | null {
  const candidates = artworks.filter((a) => a.type === type);
  if (candidates.length === 0) return null;
  const sorted = [...candidates].toSorted((a, b) => {
    const aEng = a.language === 'eng' ? 1 : 0;
    const bEng = b.language === 'eng' ? 1 : 0;
    if (aEng !== bEng) return bEng - aEng;
    return b.score - a.score;
  });
  return sorted[0]?.imageUrl ?? null;
}

/** Select the best poster (type 2) and backdrop (type 3) from TheTVDB artworks. */
export function selectBestArtwork(artworks: TvdbArtwork[]): {
  posterUrl: string | null;
  backdropUrl: string | null;
} {
  return { posterUrl: pickBest(artworks, 2), backdropUrl: pickBest(artworks, 3) };
}

async function fetchSeasonEpisodes(
  tvdbId: number,
  client: TheTvdbClient,
  detail: TvdbShowDetail
): Promise<Map<number, TvdbEpisode[]>> {
  const results = await Promise.all(
    detail.seasons.map(async (season) => ({
      seasonNumber: season.seasonNumber,
      eps: await client.getSeriesEpisodes(tvdbId, season.seasonNumber),
    }))
  );
  const map = new Map<number, TvdbEpisode[]>();
  for (const { seasonNumber, eps } of results) map.set(seasonNumber, eps);
  return map;
}

function showCreateInput(
  detail: TvdbShowDetail,
  art: ShowArtwork,
  totalEpisodes: number
): CreateTvShowInput {
  return {
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
    posterPath: art.posterUrl,
    backdropPath: art.backdropUrl,
    genres: detail.genres.map((g) => g.name),
    networks: detail.networks.map((n) => n.name),
  };
}

function insertSeasonsAndEpisodes(
  tx: MediaDb,
  showId: number,
  detail: TvdbShowDetail,
  seasonEpisodes: Map<number, TvdbEpisode[]>
): SeasonRow[] {
  const inserted: SeasonRow[] = [];
  for (const season of detail.seasons) {
    const eps = seasonEpisodes.get(season.seasonNumber) ?? [];
    const episodeCount = eps.length > 0 ? eps.length : season.episodeCount || null;
    const seasonRow = seasonsService.createSeason(tx, {
      tvShowId: showId,
      tvdbId: season.tvdbId,
      seasonNumber: season.seasonNumber,
      name: season.name,
      overview: season.overview,
      posterPath: season.imageUrl,
      episodeCount,
    });
    inserted.push(seasonRow);
    for (const ep of eps) {
      episodesService.createEpisode(tx, {
        seasonId: seasonRow.id,
        tvdbId: ep.tvdbId,
        episodeNumber: ep.episodeNumber,
        name: ep.name,
        overview: ep.overview,
        airDate: ep.airDate,
        runtime: ep.runtime,
        stillPath: ep.imageUrl,
      });
    }
  }
  return inserted;
}

interface ShowArtwork {
  posterUrl: string | null;
  backdropUrl: string | null;
}

function countEpisodes(seasonEpisodes: Map<number, TvdbEpisode[]>): number {
  let total = 0;
  for (const eps of seasonEpisodes.values()) total += eps.length;
  return total;
}

function downloadShowImages(
  tvdbId: number,
  detail: TvdbShowDetail,
  art: ShowArtwork,
  imageCache: ImageCacheService
): void {
  const seasonPosters = detail.seasons
    .filter((s) => s.imageUrl != null)
    .map((s) => ({ seasonNumber: s.seasonNumber, posterUrl: s.imageUrl }));
  imageCache
    .downloadTvShowImages({
      tvdbId,
      posterUrl: art.posterUrl,
      backdropUrl: art.backdropUrl,
      seasonPosters,
    })
    .catch((err: unknown) => {
      console.warn(
        `[addTvShow] image download failed for tvdbId ${tvdbId}: ${err instanceof Error ? err.message : String(err)}`
      );
    });
}

/**
 * Add a TV show to the local library by TVDB ID.
 *
 * Idempotent: returns the existing show (`created: false`) if already in the
 * library. Otherwise fetches full detail + episodes from TheTVDB and inserts
 * the show, its seasons, and its episodes in a single transaction.
 */
export async function addTvShow(
  db: MediaDb,
  tvdbId: number,
  client: TheTvdbClient,
  imageCache: ImageCacheService
): Promise<AddTvShowResult> {
  const existing = tvShowsService.getTvShowByTvdbId(db, tvdbId);
  if (existing) {
    return {
      show: existing,
      seasons: seasonsService.listSeasons(db, existing.id).rows,
      created: false,
    };
  }

  const detail = await client.getSeriesExtended(tvdbId);
  const seasonEpisodes = await fetchSeasonEpisodes(tvdbId, client, detail);
  const art = selectBestArtwork(detail.artworks);

  const result = db.transaction((tx): AddTvShowResult => {
    const raceCheck = tvShowsService.getTvShowByTvdbId(tx, detail.tvdbId);
    if (raceCheck) {
      return {
        show: raceCheck,
        seasons: seasonsService.listSeasons(tx, raceCheck.id).rows,
        created: false,
      };
    }
    const show = tvShowsService.createTvShow(
      tx,
      showCreateInput(detail, art, countEpisodes(seasonEpisodes))
    );
    const seasons = insertSeasonsAndEpisodes(tx, show.id, detail, seasonEpisodes);
    return { show, seasons, created: true };
  });

  if (result.created) downloadShowImages(tvdbId, detail, art, imageCache);
  return result;
}
