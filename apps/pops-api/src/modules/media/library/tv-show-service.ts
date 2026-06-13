import { eq } from 'drizzle-orm';

import { episodes, seasons, tvShows } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getTvShowByTvdbId } from '../tv-shows/service.js';

/**
 * Add TV show to library — fetches TheTVDB metadata and inserts
 * show + seasons + episodes in a single transaction.
 *
 * Cross-store note (PRD-169): `addTvShow` stays on the shared
 * `getDrizzle()` handle. The atomic insert spans `tv_shows`, `seasons`,
 * and `episodes` — seasons and episodes have not been migrated to
 * `@pops/media-db` yet (see the doc on `tv-shows/tv-shows-base.ts` —
 * "Out of scope (per PRD-166): seasons-service.ts and episodes-service.ts
 * still route through getDrizzle()"). Wrapping the show insert on the
 * media handle and the seasons/episodes inserts on the shared handle
 * would split the transaction across two SQLite files and break the
 * atomicity guarantee callers rely on.
 *
 * The library list-/quick-picks-side reads in `service.ts` and
 * `list-service.ts` therefore also stay on `getDrizzle()` until the
 * seasons/episodes (PRD-166 follow-up) and watch-history (PRD-168 PR 3)
 * writer cutovers land. Flipping just the reads would make newly-added
 * TV shows and watch events invisible to the library list, genres list,
 * and quick-picks until the next boot-time `backfillMediaFromShared()`.
 * The handle flip happens once the matching writers are on `media.db`.
 */
import type { SeasonRow, TvShowRow } from '@pops/db-types';

import type { TheTvdbClient } from '../thetvdb/client.js';
import type { TvdbArtwork, TvdbEpisode } from '../thetvdb/types.js';
import type { ImageCacheService } from '../tmdb/image-cache.js';

export interface AddTvShowResult {
  show: TvShowRow;
  seasons: SeasonRow[];
  created: boolean;
}

async function fetchSeasonEpisodes(
  tvdbId: number,
  client: TheTvdbClient,
  detail: Awaited<ReturnType<TheTvdbClient['getSeriesExtended']>>
): Promise<Map<number, TvdbEpisode[]>> {
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
  return seasonEpisodes;
}

interface InsertShowArgs {
  tx: Parameters<Parameters<ReturnType<typeof getDrizzle>['transaction']>[0]>[0];
  detail: Awaited<ReturnType<TheTvdbClient['getSeriesExtended']>>;
  seasonEpisodes: Map<number, TvdbEpisode[]>;
  posterUrl: string | null;
  backdropUrl: string | null;
  now: string;
}

function insertShowRow(args: InsertShowArgs): number {
  const { tx, detail, seasonEpisodes, posterUrl, backdropUrl, now } = args;
  let totalEpisodes = 0;
  for (const eps of seasonEpisodes.values()) totalEpisodes += eps.length;

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
  return Number(showResult.lastInsertRowid);
}

function insertEpisodes(tx: InsertShowArgs['tx'], seasonId: number, eps: TvdbEpisode[]): void {
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

function insertSeasonsAndEpisodes(
  tx: InsertShowArgs['tx'],
  showId: number,
  detail: Awaited<ReturnType<TheTvdbClient['getSeriesExtended']>>,
  seasonEpisodes: Map<number, TvdbEpisode[]>
): SeasonRow[] {
  const inserted: SeasonRow[] = [];
  for (const season of detail.seasons) {
    const eps = seasonEpisodes.get(season.seasonNumber) ?? [];
    const episodeCount = eps.length > 0 ? eps.length : season.episodeCount || null;
    const seasonResult = tx
      .insert(seasons)
      .values({
        tvShowId: showId,
        tvdbId: season.tvdbId,
        seasonNumber: season.seasonNumber,
        name: season.name,
        overview: season.overview,
        posterPath: season.imageUrl,
        episodeCount,
      })
      .run();
    const seasonId = Number(seasonResult.lastInsertRowid);
    const seasonRow = tx.select().from(seasons).where(eq(seasons.id, seasonId)).get();
    if (!seasonRow) throw new Error(`Season ${seasonId} not found after insert`);
    inserted.push(seasonRow);
    insertEpisodes(tx, seasonId, eps);
  }
  return inserted;
}

interface DownloadShowImagesArgs {
  tvdbId: number;
  detail: Awaited<ReturnType<TheTvdbClient['getSeriesExtended']>>;
  posterUrl: string | null;
  backdropUrl: string | null;
  imageCache: ImageCacheService;
}

function downloadShowImages(args: DownloadShowImagesArgs): void {
  const { tvdbId, detail, posterUrl, backdropUrl, imageCache } = args;
  const seasonPosters = detail.seasons
    .filter((s) => s.imageUrl != null)
    .map((s) => ({ seasonNumber: s.seasonNumber, posterUrl: s.imageUrl }));
  imageCache
    .downloadTvShowImages({ tvdbId, posterUrl, backdropUrl, seasonPosters })
    .catch((err) => {
      console.warn(
        `[addTvShow] Image download failed for tvdbId ${tvdbId}: ${err instanceof Error ? err.message : String(err)}`
      );
    });
}

/**
 * Add a TV show to the local library by TVDB ID.
 *
 * - Idempotent: returns existing show if already in library.
 * - Fetches full detail + episodes from TheTVDB.
 * - Inserts show, seasons, and episodes in a single transaction.
 *
 * Cross-store note (PRD-166 PR 3): the `tv_shows` writer surface
 * migrated to `getMediaDrizzle()` in PR #3007, but this one transaction
 * stays on `getDrizzle()` (shared `pops.db`) because it co-mutates
 * `seasons` and `episodes` in the same atomic unit, and those tables
 * have not yet moved to `@pops/media-db`. Splitting the transaction
 * across two SQLite files would lose atomicity (a crash between the
 * `tv_shows` insert on media.db and the `seasons`/`episodes` inserts on
 * pops.db could leave a parent row without children, surfacing as
 * empty shows in the UI). Mirrors the mixed-table strategy used by
 * `rotation/download-candidate.ts` in PRD-165 PR 3.
 *
 * Until the migration completes, callers that need to update the
 * `tv_shows` row immediately after creation must address the row on
 * the SAME handle the insert landed on — i.e. `getDrizzle()` — or the
 * update will silently no-op (the `backfillMediaFromShared` bridge is
 * insert-only and only runs at boot, so a media.db update against an
 * id that lives only in pops.db hits zero rows). The post-`addTvShow`
 * `discoverRatingKey` update in `plex/sync-discover-show.ts` is
 * routed through `getDrizzle()` for this reason.
 *
 * TODO(PRD-166 follow-up): once `seasons` + `episodes` join `tv_shows`
 * in `@pops/media-db` (PRD-166 currently lists all three but only
 * `tv_shows` has shipped), flip this transaction to
 * `getMediaDrizzle()` and collapse the `tv_shows` entry in
 * `media-backfill.ts` along with the matching shared-journal table
 * drop.
 */
export async function addTvShow(
  tvdbId: number,
  client: TheTvdbClient,
  imageCache?: ImageCacheService
): Promise<AddTvShowResult> {
  const existing = getTvShowByTvdbId(tvdbId);
  if (existing) {
    const db = getDrizzle();
    const showSeasons = db.select().from(seasons).where(eq(seasons.tvShowId, existing.id)).all();
    return { show: existing, seasons: showSeasons, created: false };
  }

  const detail = await client.getSeriesExtended(tvdbId);
  const seasonEpisodes = await fetchSeasonEpisodes(tvdbId, client, detail);
  const { posterUrl, backdropUrl } = selectBestArtwork(detail.artworks);

  const db = getDrizzle();
  const now = new Date().toISOString();

  const result = db.transaction((tx) => {
    const raceCheck = tx.select().from(tvShows).where(eq(tvShows.tvdbId, detail.tvdbId)).get();
    if (raceCheck) {
      const showSeasons = tx.select().from(seasons).where(eq(seasons.tvShowId, raceCheck.id)).all();
      return { show: raceCheck, seasons: showSeasons, created: false as const };
    }

    const showId = insertShowRow({ tx, detail, seasonEpisodes, posterUrl, backdropUrl, now });
    const insertedSeasons = insertSeasonsAndEpisodes(tx, showId, detail, seasonEpisodes);
    const showRow = tx.select().from(tvShows).where(eq(tvShows.id, showId)).get();
    if (!showRow) throw new Error(`TV show ${showId} not found after insert`);
    return { show: showRow, seasons: insertedSeasons, created: true as const };
  });

  if (result.created && imageCache) {
    downloadShowImages({ tvdbId, detail, posterUrl, backdropUrl, imageCache });
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
  const sorted = [...candidates].toSorted((a, b) => {
    const aEng = a.language === 'eng' ? 1 : 0;
    const bEng = b.language === 'eng' ? 1 : 0;
    if (aEng !== bEng) return bEng - aEng;
    return b.score - a.score;
  });

  return sorted[0]?.imageUrl ?? null;
}
