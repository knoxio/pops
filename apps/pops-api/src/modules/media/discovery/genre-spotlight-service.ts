/**
 * Genre spotlight service — selects top user genres and fetches
 * high-rated TMDB movies per genre, scored by user preference.
 */
import type { TmdbClient } from "../tmdb/client.js";
import type {
  DiscoverResult,
  ScoredDiscoverResult,
  PreferenceProfile,
  GenreAffinity,
  GenreDistribution,
} from "./types.js";
import { TMDB_GENRE_MAP } from "./types.js";
import { scoreDiscoverResults } from "./service.js";

/** Genre name → TMDB genre ID reverse map. */
const GENRE_NAME_TO_ID: Record<string, number> = {};
for (const [id, name] of Object.entries(TMDB_GENRE_MAP)) {
  GENRE_NAME_TO_ID[name] = Number(id);
}

/**
 * Related genre pairs — these should not appear together in the spotlight.
 * Stored as sorted pairs of genre names for easy lookup.
 */
const RELATED_GENRE_PAIRS: [string, string][] = [
  ["Action", "Adventure"],
  ["Mystery", "Thriller"],
  ["Drama", "Romance"],
  ["Fantasy", "Science Fiction"],
];

/** Check if two genre names are related (should not both be in spotlight). */
function areRelated(a: string, b: string): boolean {
  return RELATED_GENRE_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

/** Build a poster URL: proxy for library items, TMDB CDN for non-library items. */
function buildPosterUrl(
  posterPath: string | null,
  tmdbId: number,
  inLibrary: boolean
): string | null {
  if (!posterPath) return null;
  if (inLibrary) return `/media/images/movie/${tmdbId}/poster.jpg`;
  return `https://image.tmdb.org/t/p/w342${posterPath}`;
}

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

/**
 * Select 2-3 top genres from the user's affinity or distribution data,
 * avoiding related genre pairs.
 */
export function selectTopGenres(
  affinities: GenreAffinity[],
  distribution: GenreDistribution[]
): string[] {
  const TARGET = 3;

  // Prefer ELO-based affinities; fall back to watch history distribution
  const ranked: string[] =
    affinities.length > 0
      ? affinities.map((a) => a.genre)
      : [...distribution].sort((a, b) => b.percentage - a.percentage).map((g) => g.genre);

  const selected: string[] = [];

  for (const genre of ranked) {
    // Must have a TMDB genre ID
    if (!(genre in GENRE_NAME_TO_ID)) continue;

    // Check not related to any already selected
    const conflictsWithSelected = selected.some((s) => areRelated(s, genre));
    if (conflictsWithSelected) continue;

    selected.push(genre);
    if (selected.length >= TARGET) break;
  }

  return selected;
}

/**
 * Fetch genre spotlight results — discover high-rated movies per genre,
 * scored by user preference.
 */
export async function getGenreSpotlight(
  client: TmdbClient,
  profile: PreferenceProfile,
  libraryIds: Set<number>
): Promise<GenreSpotlightResponse> {
  const genres = selectTopGenres(profile.genreAffinities, profile.genreDistribution);

  if (genres.length === 0) {
    return { genres: [] };
  }

  // TODO: Exclude dismissed movies once tb-115 (dismissed_discover schema) lands

  const entries = await Promise.all(
    genres.map(async (genreName) => {
      const genreId = GENRE_NAME_TO_ID[genreName] ?? 0;
      if (genreId === 0) return null;
      const response = await client.discoverMovies({
        genreIds: [genreId],
        sortBy: "vote_average.desc",
        voteCountGte: 100,
        page: 1,
      });

      // Map to DiscoverResult, excluding library
      const results: DiscoverResult[] = response.results
        .filter((r) => !libraryIds.has(r.tmdbId))
        .map((r) => {
          const inLibrary = false;
          return {
            tmdbId: r.tmdbId,
            title: r.title,
            overview: r.overview,
            releaseDate: r.releaseDate,
            posterPath: r.posterPath,
            posterUrl: buildPosterUrl(r.posterPath, r.tmdbId, inLibrary),
            backdropPath: r.backdropPath,
            voteAverage: r.voteAverage,
            voteCount: r.voteCount,
            genreIds: r.genreIds,
            popularity: r.popularity,
            inLibrary,
          };
        });

      const scored = scoreDiscoverResults(results, profile);

      return {
        genreId,
        genreName,
        results: scored,
        totalPages: response.totalPages,
      };
    })
  );

  return {
    genres: entries.filter((e): e is GenreSpotlightEntry => e != null),
  };
}

/**
 * Fetch additional page of genre spotlight results for a specific genre.
 */
export async function getGenreSpotlightPage(
  client: TmdbClient,
  profile: PreferenceProfile,
  libraryIds: Set<number>,
  genreId: number,
  page: number
): Promise<GenreSpotlightPageResponse> {
  const genreName = TMDB_GENRE_MAP[genreId] ?? "Unknown";

  const response = await client.discoverMovies({
    genreIds: [genreId],
    sortBy: "vote_average.desc",
    voteCountGte: 100,
    page,
  });

  const results: DiscoverResult[] = response.results
    .filter((r) => !libraryIds.has(r.tmdbId))
    .map((r) => {
      const inLibrary = false;
      return {
        tmdbId: r.tmdbId,
        title: r.title,
        overview: r.overview,
        releaseDate: r.releaseDate,
        posterPath: r.posterPath,
        posterUrl: buildPosterUrl(r.posterPath, r.tmdbId, inLibrary),
        backdropPath: r.backdropPath,
        voteAverage: r.voteAverage,
        voteCount: r.voteCount,
        genreIds: r.genreIds,
        popularity: r.popularity,
        inLibrary,
      };
    });

  const scored = scoreDiscoverResults(results, profile);

  return {
    genreId,
    genreName,
    results: scored,
    page: response.page,
    totalPages: response.totalPages,
  };
}
