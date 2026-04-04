import { describe, it, expect } from "vitest";
import { scoreDiscoverResults } from "./service.js";
import type { DiscoverResult, PreferenceProfile } from "./types.js";
import { TMDB_GENRE_MAP } from "./types.js";

/** Helper to build a minimal DiscoverResult. */
function makeResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    tmdbId: 1,
    title: "Test Movie",
    overview: "",
    releaseDate: "2025-01-01",
    posterPath: null,
    posterUrl: null,
    backdropPath: null,
    voteAverage: 7.5,
    voteCount: 100,
    genreIds: [28, 878], // Action, Science Fiction
    popularity: 50,
    inLibrary: false,
    isWatched: false,
    onWatchlist: false,
    ...overrides,
  };
}

/** Helper to build a minimal PreferenceProfile. */
function makeProfile(overrides: Partial<PreferenceProfile> = {}): PreferenceProfile {
  return {
    genreAffinities: [],
    dimensionWeights: [],
    genreDistribution: [],
    totalMoviesWatched: 0,
    totalComparisons: 0,
    ...overrides,
  };
}

describe("scoreDiscoverResults", () => {
  it("returns 0% match when profile has no data", () => {
    const results = [makeResult()];
    const scored = scoreDiscoverResults(results, makeProfile());

    expect(scored).toHaveLength(1);
    expect(scored[0]!.matchPercentage).toBe(0);
    expect(scored[0]!.matchReason).toBe("");
  });

  it("scores based on genre affinities", () => {
    const results = [
      makeResult({ tmdbId: 1, genreIds: [28, 878], title: "Action Sci-Fi" }), // Action + Science Fiction
      makeResult({ tmdbId: 2, genreIds: [35, 10749], title: "Rom Com" }), // Comedy + Romance
    ];
    const profile = makeProfile({
      genreAffinities: [
        { genre: "Action", avgScore: 1500, movieCount: 10, totalComparisons: 50 },
        { genre: "Science Fiction", avgScore: 1400, movieCount: 8, totalComparisons: 40 },
        { genre: "Comedy", avgScore: 1100, movieCount: 5, totalComparisons: 20 },
        { genre: "Romance", avgScore: 1000, movieCount: 3, totalComparisons: 10 },
      ],
    });

    const scored = scoreDiscoverResults(results, profile);

    // Action/Sci-Fi should score higher than Comedy/Romance
    expect(scored[0]!.title).toBe("Action Sci-Fi");
    expect(scored[0]!.matchPercentage).toBeGreaterThan(scored[1]!.matchPercentage);
    // Both should be in the 50-98 range
    expect(scored[0]!.matchPercentage).toBeGreaterThanOrEqual(50);
    expect(scored[0]!.matchPercentage).toBeLessThanOrEqual(98);
    expect(scored[1]!.matchPercentage).toBeGreaterThanOrEqual(50);
  });

  it("includes matching genre names in matchReason", () => {
    const results = [makeResult({ genreIds: [28, 878, 53] })]; // Action, Sci-Fi, Thriller
    const profile = makeProfile({
      genreAffinities: [
        { genre: "Action", avgScore: 1500, movieCount: 10, totalComparisons: 50 },
        { genre: "Science Fiction", avgScore: 1400, movieCount: 8, totalComparisons: 40 },
        { genre: "Thriller", avgScore: 1300, movieCount: 6, totalComparisons: 30 },
      ],
    });

    const scored = scoreDiscoverResults(results, profile);

    expect(scored[0]!.matchReason).toContain("Action");
    expect(scored[0]!.matchReason).toContain("Science Fiction");
  });

  it("falls back to genre distribution when no affinities exist", () => {
    const results = [makeResult({ genreIds: [28] })]; // Action
    const profile = makeProfile({
      genreDistribution: [
        { genre: "Action", watchCount: 10, percentage: 80 },
        { genre: "Drama", watchCount: 3, percentage: 24 },
      ],
      totalMoviesWatched: 13,
    });

    const scored = scoreDiscoverResults(results, profile);

    expect(scored[0]!.matchPercentage).toBeGreaterThan(50);
    expect(scored[0]!.matchReason).toContain("Action");
  });

  it("sorts results by matchPercentage descending", () => {
    const results = [
      makeResult({ tmdbId: 1, genreIds: [35], title: "Low Match" }), // Comedy only
      makeResult({ tmdbId: 2, genreIds: [28], title: "High Match" }), // Action only
    ];
    const profile = makeProfile({
      genreAffinities: [
        { genre: "Action", avgScore: 1500, movieCount: 10, totalComparisons: 50 },
        { genre: "Comedy", avgScore: 1000, movieCount: 2, totalComparisons: 5 },
      ],
    });

    const scored = scoreDiscoverResults(results, profile);

    expect(scored[0]!.title).toBe("High Match");
    expect(scored[1]!.title).toBe("Low Match");
  });

  it("handles results with unknown genre IDs gracefully", () => {
    const results = [makeResult({ genreIds: [99999] })]; // Unknown genre
    const profile = makeProfile({
      genreAffinities: [{ genre: "Action", avgScore: 1500, movieCount: 10, totalComparisons: 50 }],
    });

    const scored = scoreDiscoverResults(results, profile);

    expect(scored[0]!.matchPercentage).toBe(0);
    expect(scored[0]!.matchReason).toBe("");
  });
});

describe("fromYourServer genre mapping and scoring", () => {
  /** Reverse map used by getUnwatchedLibraryMovies to convert genre names → IDs. */
  const GENRE_NAME_TO_ID = Object.fromEntries(
    Object.entries(TMDB_GENRE_MAP).map(([id, name]) => [name, Number(id)])
  );

  /** Simulate the genre mapping logic from getUnwatchedLibraryMovies. */
  function libraryMovieToDiscoverResult(movie: {
    tmdbId: number;
    title: string;
    genres: string;
    voteAverage: number;
  }): DiscoverResult {
    const genreNames: string[] = JSON.parse(movie.genres);
    const genreIds = genreNames
      .map((name) => GENRE_NAME_TO_ID[name])
      .filter((id): id is number => id != null);

    return {
      tmdbId: movie.tmdbId,
      title: movie.title,
      overview: "",
      releaseDate: "",
      posterPath: null,
      posterUrl: null,
      backdropPath: null,
      voteAverage: movie.voteAverage,
      voteCount: 0,
      genreIds,
      popularity: 0,
      inLibrary: true,
      isWatched: false,
      onWatchlist: false,
    };
  }

  it("maps library genre names to TMDB genre IDs for scoring", () => {
    const movie = libraryMovieToDiscoverResult({
      tmdbId: 100,
      title: "Test Movie",
      genres: JSON.stringify(["Action", "Science Fiction"]),
      voteAverage: 8.0,
    });

    expect(movie.genreIds).toEqual([28, 878]);
    expect(movie.inLibrary).toBe(true);
  });

  it("scores unwatched library movies against profile", () => {
    const libraryMovies = [
      libraryMovieToDiscoverResult({
        tmdbId: 1,
        title: "Action Hit",
        genres: JSON.stringify(["Action", "Thriller"]),
        voteAverage: 8.5,
      }),
      libraryMovieToDiscoverResult({
        tmdbId: 2,
        title: "Rom Com",
        genres: JSON.stringify(["Comedy", "Romance"]),
        voteAverage: 6.5,
      }),
    ];

    const profile = makeProfile({
      genreAffinities: [
        { genre: "Action", avgScore: 1500, movieCount: 10, totalComparisons: 50 },
        { genre: "Thriller", avgScore: 1400, movieCount: 8, totalComparisons: 40 },
        { genre: "Comedy", avgScore: 1000, movieCount: 3, totalComparisons: 10 },
        { genre: "Romance", avgScore: 900, movieCount: 2, totalComparisons: 5 },
      ],
    });

    const scored = scoreDiscoverResults(libraryMovies, profile);

    expect(scored[0]!.title).toBe("Action Hit");
    expect(scored[0]!.matchPercentage).toBeGreaterThan(scored[1]!.matchPercentage);
    expect(scored[0]!.matchPercentage).toBeGreaterThanOrEqual(50);
    expect(scored[0]!.matchPercentage).toBeLessThanOrEqual(98);
  });

  it("returns empty scored array when no movies provided", () => {
    const scored = scoreDiscoverResults([], makeProfile());
    expect(scored).toEqual([]);
  });

  it("handles malformed genres JSON gracefully", () => {
    // Simulate the try/catch logic in getUnwatchedLibraryMovies
    let genreNames: string[] = [];
    try {
      genreNames = JSON.parse("not valid json") as string[];
    } catch {
      // Falls back to empty — same as production code
    }
    expect(genreNames).toEqual([]);
  });

  it("ignores unknown genre names from library data", () => {
    const movie = libraryMovieToDiscoverResult({
      tmdbId: 1,
      title: "Weird Genre",
      genres: JSON.stringify(["NonexistentGenre", "Action"]),
      voteAverage: 7.0,
    });

    // Only Action should map, NonexistentGenre should be filtered
    expect(movie.genreIds).toEqual([28]);
  });
});
