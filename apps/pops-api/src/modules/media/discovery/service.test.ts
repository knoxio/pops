import { describe, it, expect } from "vitest";
import { scoreRecommendations } from "./service.js";
import type { DiscoverResult, PreferenceProfile } from "./types.js";

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

describe("scoreRecommendations", () => {
  it("returns 0% match when profile has no data", () => {
    const results = [makeResult()];
    const scored = scoreRecommendations(results, makeProfile());

    expect(scored).toHaveLength(1);
    expect(scored[0].matchPercentage).toBe(0);
    expect(scored[0].matchReason).toBe("");
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

    const scored = scoreRecommendations(results, profile);

    // Action/Sci-Fi should score higher than Comedy/Romance
    expect(scored[0].title).toBe("Action Sci-Fi");
    expect(scored[0].matchPercentage).toBeGreaterThan(scored[1].matchPercentage);
    // Both should be in the 50-98 range
    expect(scored[0].matchPercentage).toBeGreaterThanOrEqual(50);
    expect(scored[0].matchPercentage).toBeLessThanOrEqual(98);
    expect(scored[1].matchPercentage).toBeGreaterThanOrEqual(50);
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

    const scored = scoreRecommendations(results, profile);

    expect(scored[0].matchReason).toContain("Action");
    expect(scored[0].matchReason).toContain("Science Fiction");
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

    const scored = scoreRecommendations(results, profile);

    expect(scored[0].matchPercentage).toBeGreaterThan(50);
    expect(scored[0].matchReason).toContain("Action");
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

    const scored = scoreRecommendations(results, profile);

    expect(scored[0].title).toBe("High Match");
    expect(scored[1].title).toBe("Low Match");
  });

  it("handles results with unknown genre IDs gracefully", () => {
    const results = [makeResult({ genreIds: [99999] })]; // Unknown genre
    const profile = makeProfile({
      genreAffinities: [{ genre: "Action", avgScore: 1500, movieCount: 10, totalComparisons: 50 }],
    });

    const scored = scoreRecommendations(results, profile);

    expect(scored[0].matchPercentage).toBe(0);
    expect(scored[0].matchReason).toBe("");
  });
});
