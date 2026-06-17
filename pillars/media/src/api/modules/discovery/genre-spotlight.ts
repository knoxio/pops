/**
 * Genre spotlight — top user genres with high-rated TMDB movies, profile-scored.
 *
 * Ported from the monolith `genre-spotlight-service.ts`. Selection of which
 * genres to spotlight (avoiding near-duplicates) lives alongside the per-genre
 * discover fetch; the per-page loader reuses the same fetch.
 */
import {
  TMDB_GENRE_MAP,
  discoveryService,
  type PreferenceProfile,
  type ScoredDiscoverResult,
} from '../../../db/index.js';
import { loadFlagSets, type DiscoveryDeps } from './deps.js';
import { buildPosterUrl, type FlagSets } from './discover-result-mapper.js';
import { GENRE_NAME_TO_ID, areRelated } from './genre-map.js';

import type { DiscoverResult, GenreAffinity, GenreDistribution } from '../../../db/index.js';
import type { TmdbSearchResult } from '../../clients/tmdb/index.js';

const TARGET_GENRES = 3;

export interface GenreSpotlightEntry {
  genreId: number;
  genreName: string;
  results: ScoredDiscoverResult[];
  totalPages: number;
}

export interface GenreSpotlightResponse {
  genres: GenreSpotlightEntry[];
}

export interface GenreSpotlightPageResponse {
  genreId: number;
  genreName: string;
  results: ScoredDiscoverResult[];
  page: number;
  totalPages: number;
}

/** Pick up to {@link TARGET_GENRES} top genres, skipping near-duplicate pairs. */
export function selectTopGenres(
  affinities: GenreAffinity[],
  distribution: GenreDistribution[]
): string[] {
  const ranked: string[] =
    affinities.length > 0
      ? affinities.map((a) => a.genre)
      : [...distribution].toSorted((a, b) => b.percentage - a.percentage).map((g) => g.genre);

  const selected: string[] = [];
  for (const genre of ranked) {
    if (!GENRE_NAME_TO_ID.has(genre)) continue;
    if (selected.some((s) => areRelated(s, genre))) continue;
    selected.push(genre);
    if (selected.length >= TARGET_GENRES) break;
  }
  return selected;
}

function mapNonLibrary(r: TmdbSearchResult, flags: FlagSets): DiscoverResult {
  return {
    tmdbId: r.tmdbId,
    title: r.title,
    overview: r.overview,
    releaseDate: r.releaseDate,
    posterPath: r.posterPath,
    posterUrl: buildPosterUrl(r.posterPath, r.tmdbId, false),
    backdropPath: r.backdropPath,
    voteAverage: r.voteAverage,
    voteCount: r.voteCount,
    genreIds: r.genreIds,
    popularity: r.popularity,
    inLibrary: false,
    isWatched: flags.watchedIds.has(r.tmdbId),
    onWatchlist: flags.watchlistIds.has(r.tmdbId),
  };
}

interface FetchGenreArgs {
  deps: DiscoveryDeps;
  profile: PreferenceProfile;
  flags: FlagSets;
  genreId: number;
  page: number;
}

async function fetchScoredGenrePage(
  args: FetchGenreArgs
): Promise<{ results: ScoredDiscoverResult[]; totalPages: number }> {
  const { deps, profile, flags, genreId, page } = args;
  const response = await deps.tmdbClient.discoverMovies({
    genreIds: [genreId],
    sortBy: 'vote_average.desc',
    voteCountGte: 100,
    page,
  });
  const mapped = response.results
    .filter((r) => !flags.libraryIds.has(r.tmdbId) && !flags.dismissedIds.has(r.tmdbId))
    .map((r) => mapNonLibrary(r, flags));
  return {
    results: discoveryService.scoreDiscoverResults(mapped, profile),
    totalPages: response.totalPages,
  };
}

/** Genre spotlight: discover high-rated movies for the user's top genres. */
export async function getGenreSpotlight(deps: DiscoveryDeps): Promise<GenreSpotlightResponse> {
  const profile = discoveryService.getPreferenceProfile(deps.db);
  const genres = selectTopGenres(profile.genreAffinities, profile.genreDistribution);
  if (genres.length === 0) return { genres: [] };

  const flags = loadFlagSets(deps.db);
  const entries = await Promise.all(
    genres.map(async (genreName): Promise<GenreSpotlightEntry | null> => {
      const genreId = GENRE_NAME_TO_ID.get(genreName) ?? 0;
      if (genreId === 0) return null;
      const { results, totalPages } = await fetchScoredGenrePage({
        deps,
        profile,
        flags,
        genreId,
        page: 1,
      });
      return { genreId, genreName, results, totalPages };
    })
  );
  return { genres: entries.filter((e): e is GenreSpotlightEntry => e != null) };
}

/** Load an additional page of spotlight results for one genre. */
export async function getGenreSpotlightPage(
  deps: DiscoveryDeps,
  genreId: number,
  page: number
): Promise<GenreSpotlightPageResponse> {
  const profile = discoveryService.getPreferenceProfile(deps.db);
  const flags = loadFlagSets(deps.db);
  const genreName = TMDB_GENRE_MAP[genreId] ?? 'Unknown';
  const { results, totalPages } = await fetchScoredGenrePage({
    deps,
    profile,
    flags,
    genreId,
    page,
  });
  return { genreId, genreName, results, page, totalPages };
}
