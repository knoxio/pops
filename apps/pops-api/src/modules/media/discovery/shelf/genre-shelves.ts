/**
 * Genre and dimension shelf implementations (US-06).
 *
 * Four template ShelfDefinitions (category='seed', template=true):
 *
 *  1. best-in-genre      — One instance per top genre (up to 5), queries TMDB discover by genre
 *  2. genre-crossover    — Pairs of top genres excluding related pairs, queries TMDB with both genres
 *  3. top-dimension      — One per active ELO dimension, shows local movies ranked highest
 *  4. dimension-inspired — High-scoring movie+dimension pair, queries TMDB recommendations
 */
import { eq, and, desc } from "drizzle-orm";
import { getDrizzle } from "../../../../db.js";
import { movies, mediaScores, comparisonDimensions } from "@pops/db-types";
import { getTmdbClient } from "../../tmdb/index.js";
import { TMDB_GENRE_MAP } from "../types.js";
import { getLibraryTmdbIds, toDiscoverResults } from "../tmdb-service.js";
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from "../flags.js";
import { scoreDiscoverResults } from "../service.js";
import { registerShelf } from "./registry.js";
import type { ShelfDefinition, ShelfInstance } from "./types.js";
import type { PreferenceProfile } from "../types.js";

const MAX_BEST_IN_GENRE = 5;
const MAX_CROSSOVER_PAIRS = 6;
const MAX_TOP_DIMENSION = 5;
const MAX_DIMENSION_INSPIRED = 3;

// Genre pairs that are too closely related to be interesting as crossovers
const RELATED_GENRE_PAIRS = new Set([
  "Action+Adventure",
  "Adventure+Action",
  "Mystery+Thriller",
  "Thriller+Mystery",
  "Drama+Romance",
  "Romance+Drama",
  "Fantasy+Science Fiction",
  "Science Fiction+Fantasy",
]);

function isRelatedPair(genre1: string, genre2: string): boolean {
  return RELATED_GENRE_PAIRS.has(`${genre1}+${genre2}`);
}

/** Reverse map: genre name → TMDB genre ID */
const GENRE_NAME_TO_ID = new Map<string, number>(
  Object.entries(TMDB_GENRE_MAP).map(([id, name]) => [name, Number(id)])
);

/** Normalize affinity score to 0–1 range for a given list. */
function normalizeScore(score: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (score - min) / (max - min);
}

// ─────────────────────────────────────────────
// Shelf 1: Best in Genre
// ─────────────────────────────────────────────
export const bestInGenreShelf: ShelfDefinition = {
  id: "best-in-genre",
  template: true,
  category: "seed",
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const topGenres = profile.genreAffinities
      .slice()
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, MAX_BEST_IN_GENRE)
      .filter((a) => GENRE_NAME_TO_ID.has(a.genre));

    if (topGenres.length === 0) return [];

    const scores = topGenres.map((a) => a.avgScore);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    return topGenres.map((affinity) => {
      const genreId = GENRE_NAME_TO_ID.get(affinity.genre) ?? 0;
      const score = normalizeScore(affinity.avgScore, minScore, maxScore) * 0.8 + 0.1;

      return {
        shelfId: `best-in-genre:${affinity.genre.toLowerCase().replace(/\s+/g, "-")}`,
        title: `Best in ${affinity.genre}`,
        subtitle: `Top-rated ${affinity.genre} films`,
        emoji: "🎯",
        score,
        query: async ({ limit, offset }) => {
          const client = getTmdbClient();
          const page = Math.floor(offset / 20) + 1;

          const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
            client.discoverMovies({
              genreIds: [genreId],
              sortBy: "vote_average.desc",
              voteCountGte: 50,
              page,
            }),
            Promise.resolve(getLibraryTmdbIds()),
            Promise.resolve(getWatchedTmdbIds()),
            Promise.resolve(getWatchlistTmdbIds()),
            Promise.resolve(getDismissedTmdbIds()),
          ]);

          const raw = toDiscoverResults(
            response.results,
            libraryIds,
            watchedIds,
            watchlistIds
          ).filter((r) => !dismissedIds.has(r.tmdbId));

          const scored = scoreDiscoverResults(raw, profile);
          scored.sort((a, b) => b.matchPercentage - a.matchPercentage);

          const start = offset % 20;
          return scored.slice(start, start + limit);
        },
      };
    });
  },
};

// ─────────────────────────────────────────────
// Shelf 2: Genre Crossover
// ─────────────────────────────────────────────
export const genreCrossoverShelf: ShelfDefinition = {
  id: "genre-crossover",
  template: true,
  category: "seed",
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const topGenres = profile.genreAffinities
      .slice()
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 6)
      .filter((a) => GENRE_NAME_TO_ID.has(a.genre));

    if (topGenres.length < 2) return [];

    const pairs: Array<[(typeof topGenres)[0], (typeof topGenres)[0]]> = [];
    for (let i = 0; i < topGenres.length && pairs.length < MAX_CROSSOVER_PAIRS; i++) {
      for (let j = i + 1; j < topGenres.length && pairs.length < MAX_CROSSOVER_PAIRS; j++) {
        const g1 = topGenres[i];
        const g2 = topGenres[j];
        if (!g1 || !g2) continue;
        if (!isRelatedPair(g1.genre, g2.genre)) {
          pairs.push([g1, g2]);
        }
      }
    }

    return pairs.map(([g1, g2]) => {
      const id1 = GENRE_NAME_TO_ID.get(g1.genre) ?? 0;
      const id2 = GENRE_NAME_TO_ID.get(g2.genre) ?? 0;
      const score = ((g1.avgScore + g2.avgScore) / 2 / 10) * 0.7 + 0.1;

      return {
        shelfId: `genre-crossover:${g1.genre.toLowerCase().replace(/\s+/g, "-")}-${g2.genre.toLowerCase().replace(/\s+/g, "-")}`,
        title: `${g1.genre} × ${g2.genre}`,
        subtitle: `Films that blend ${g1.genre} and ${g2.genre}`,
        emoji: "🔀",
        score: Math.min(0.9, score),
        query: async ({ limit, offset }) => {
          const client = getTmdbClient();
          const page = Math.floor(offset / 20) + 1;

          const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
            client.discoverMovies({ genreIds: [id1, id2], voteCountGte: 20, page }),
            Promise.resolve(getLibraryTmdbIds()),
            Promise.resolve(getWatchedTmdbIds()),
            Promise.resolve(getWatchlistTmdbIds()),
            Promise.resolve(getDismissedTmdbIds()),
          ]);

          const raw = toDiscoverResults(
            response.results,
            libraryIds,
            watchedIds,
            watchlistIds
          ).filter((r) => !dismissedIds.has(r.tmdbId));

          const scored = scoreDiscoverResults(raw, profile);
          scored.sort((a, b) => b.matchPercentage - a.matchPercentage);

          const start = offset % 20;
          return scored.slice(start, start + limit);
        },
      };
    });
  },
};

// ─────────────────────────────────────────────
// Shelf 3: Top Dimension
// ─────────────────────────────────────────────

interface DimensionSeed {
  dimensionId: number;
  name: string;
  avgScore: number;
}

function getActiveDimensions(profile: PreferenceProfile): DimensionSeed[] {
  return profile.dimensionWeights
    .filter((d) => d.comparisonCount >= 5)
    .sort((a, b) => b.comparisonCount - a.comparisonCount)
    .slice(0, MAX_TOP_DIMENSION)
    .map((d) => ({ dimensionId: d.dimensionId, name: d.name, avgScore: d.avgScore }));
}

function getTopMoviesForDimension(
  dimensionId: number,
  limit: number
): Array<{ movieId: number; tmdbId: number; title: string; score: number }> {
  const db = getDrizzle();
  const rows = db
    .select({
      movieId: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      score: mediaScores.score,
    })
    .from(mediaScores)
    .innerJoin(movies, and(eq(movies.id, mediaScores.mediaId), eq(mediaScores.mediaType, "movie")))
    .where(eq(mediaScores.dimensionId, dimensionId))
    .orderBy(desc(mediaScores.score))
    .limit(limit)
    .all();
  return rows;
}

export const topDimensionShelf: ShelfDefinition = {
  id: "top-dimension",
  template: true,
  category: "seed",
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const dimensions = getActiveDimensions(profile);
    if (dimensions.length === 0) return [];

    return dimensions.map((dim) => ({
      shelfId: `top-dimension:${dim.dimensionId}`,
      title: `Top ${dim.name} picks`,
      subtitle: `Your highest-rated films for ${dim.name}`,
      emoji: "⭐",
      score: Math.min(0.9, 0.5 + dim.avgScore / 3000),
      query: ({ limit, offset }) => {
        const topMovies = getTopMoviesForDimension(dim.dimensionId, limit + offset);
        const sliced = topMovies.slice(offset, offset + limit);

        const libraryIds = getLibraryTmdbIds();
        const watchedIds = getWatchedTmdbIds();
        const watchlistIds = getWatchlistTmdbIds();
        const dismissedIds = getDismissedTmdbIds();

        return Promise.resolve(
          sliced
            .filter((m) => !dismissedIds.has(m.tmdbId))
            .map((m) => ({
              tmdbId: m.tmdbId,
              title: m.title,
              overview: "",
              releaseDate: "",
              posterPath: null,
              posterUrl: libraryIds.has(m.tmdbId)
                ? `/media/images/movie/${m.tmdbId}/poster.jpg`
                : null,
              backdropPath: null,
              voteAverage: 0,
              voteCount: 0,
              genreIds: [],
              popularity: 0,
              inLibrary: libraryIds.has(m.tmdbId),
              isWatched: watchedIds.has(m.tmdbId),
              onWatchlist: watchlistIds.has(m.tmdbId),
            }))
        );
      },
    }));
  },
};

// ─────────────────────────────────────────────
// Shelf 4: Dimension Inspired
// ─────────────────────────────────────────────

function getHighScoringMovieForDimension(
  dimensionId: number
): { movieId: number; tmdbId: number; title: string } | null {
  const db = getDrizzle();
  const rows = db
    .select({
      movieId: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
    })
    .from(mediaScores)
    .innerJoin(movies, and(eq(movies.id, mediaScores.mediaId), eq(mediaScores.mediaType, "movie")))
    .innerJoin(comparisonDimensions, eq(comparisonDimensions.id, mediaScores.dimensionId))
    .where(eq(mediaScores.dimensionId, dimensionId))
    .orderBy(desc(mediaScores.score))
    .limit(1)
    .all();

  return rows[0] ?? null;
}

export const dimensionInspiredShelf: ShelfDefinition = {
  id: "dimension-inspired",
  template: true,
  category: "seed",
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const dimensions = getActiveDimensions(profile).slice(0, MAX_DIMENSION_INSPIRED);
    if (dimensions.length === 0) return [];

    const instances: ShelfInstance[] = [];
    for (const dim of dimensions) {
      const seed = getHighScoringMovieForDimension(dim.dimensionId);
      if (!seed) continue;

      instances.push({
        shelfId: `dimension-inspired:${seed.movieId}:${dim.dimensionId}`,
        title: `You loved ${seed.title}'s ${dim.name}`,
        subtitle: `Similar films based on ${dim.name}`,
        emoji: "💡",
        score: 0.75,
        seedMovieId: seed.movieId,
        query: async ({ limit, offset }) => {
          const client = getTmdbClient();
          const page = Math.floor(offset / 20) + 1;

          const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
            client.getMovieRecommendations(seed.tmdbId, page),
            Promise.resolve(getLibraryTmdbIds()),
            Promise.resolve(getWatchedTmdbIds()),
            Promise.resolve(getWatchlistTmdbIds()),
            Promise.resolve(getDismissedTmdbIds()),
          ]);

          const raw = toDiscoverResults(
            response.results,
            libraryIds,
            watchedIds,
            watchlistIds
          ).filter((r) => !dismissedIds.has(r.tmdbId));

          const scored = scoreDiscoverResults(raw, profile);
          scored.sort((a, b) => b.matchPercentage - a.matchPercentage);

          const start = offset % 20;
          return scored.slice(start, start + limit);
        },
      });
    }

    return instances;
  },
};

registerShelf(bestInGenreShelf);
registerShelf(genreCrossoverShelf);
registerShelf(topDimensionShelf);
registerShelf(dimensionInspiredShelf);
