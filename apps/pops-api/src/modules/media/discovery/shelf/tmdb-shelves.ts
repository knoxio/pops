/**
 * TMDB-powered discovery shelves — 5 static (template=false) shelves
 * that each query TMDB /discover/movie with different filters:
 *
 *  1. new-releases      — Last 30 days, filtered by top genre affinities
 *  2. hidden-gems       — Vote count 50-500, avg ≥7.0, top genres
 *  3. critics-vs-audiences — High avg (≥8.0) + low popularity (ascending sort)
 *  4. award-winners     — TMDB keyword IDs for academy-award / golden-globe + top genres
 *  5. decade-picks      — Year range of the decade with most watches in watch_history
 */
import { sql } from "drizzle-orm";
import { getDrizzle } from "../../../../db.js";
import { watchHistory, movies } from "@pops/db-types";
import { getTmdbClient } from "../../tmdb/index.js";
import { TMDB_GENRE_MAP } from "../types.js";
import { getLibraryTmdbIds, toDiscoverResults } from "../tmdb-service.js";
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from "../flags.js";
import { scoreDiscoverResults } from "../service.js";
import { registerShelf } from "./registry.js";
import type { ShelfDefinition, ShelfInstance } from "./types.js";
import type { PreferenceProfile } from "../types.js";

// TMDB keyword IDs for award-winners shelf
const ACADEMY_AWARD_KEYWORD_ID = 154712;
const GOLDEN_GLOBE_KEYWORD_ID = 156299;

/**
 * Map genre names from user profile affinities to TMDB genre IDs.
 * Uses the top N genres by avgScore.
 */
function topGenreIds(profile: PreferenceProfile, limit = 3): number[] {
  const reverseMap = new Map<string, number>(
    Object.entries(TMDB_GENRE_MAP).map(([id, name]) => [name, Number(id)])
  );
  return profile.genreAffinities
    .slice()
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, limit)
    .map((a) => reverseMap.get(a.genre))
    .filter((id): id is number => id !== undefined);
}

/** Determine the decade (e.g. 1990) with the most completed movie watches. */
function getMostWatchedDecade(): number {
  const db = getDrizzle();
  const rows = db
    .select({
      decade: sql<number>`CAST(SUBSTR(${movies.releaseDate}, 1, 3) AS INTEGER) * 10`,
      watchCount: sql<number>`COUNT(*)`,
    })
    .from(watchHistory)
    .innerJoin(movies, sql`${movies.id} = ${watchHistory.mediaId}`)
    .where(
      sql`${watchHistory.mediaType} = 'movie' AND ${watchHistory.completed} = 1 AND ${movies.releaseDate} IS NOT NULL AND LENGTH(${movies.releaseDate}) >= 4`
    )
    .groupBy(sql`CAST(SUBSTR(${movies.releaseDate}, 1, 3) AS INTEGER) * 10`)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(1)
    .all();

  return rows[0]?.decade ?? 1990;
}

/** Build a ShelfInstance that calls discoverMovies with given opts. */
function buildTmdbInstance(
  shelfId: string,
  title: string,
  subtitle: string,
  emoji: string,
  score: number,
  profile: PreferenceProfile,
  discoverOpts: (page: number) => Parameters<ReturnType<typeof getTmdbClient>["discoverMovies"]>[0]
): ShelfInstance {
  return {
    shelfId,
    title,
    subtitle,
    emoji,
    score,
    query: async ({ limit, offset }) => {
      const client = getTmdbClient();
      const page = Math.floor(offset / 20) + 1;

      const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
        client.discoverMovies(discoverOpts(page)),
        Promise.resolve(getLibraryTmdbIds()),
        Promise.resolve(getWatchedTmdbIds()),
        Promise.resolve(getWatchlistTmdbIds()),
        Promise.resolve(getDismissedTmdbIds()),
      ]);

      const raw = toDiscoverResults(response.results, libraryIds, watchedIds, watchlistIds).filter(
        (r) => !dismissedIds.has(r.tmdbId)
      );

      const scored = scoreDiscoverResults(raw, profile);
      scored.sort((a, b) => b.matchPercentage - a.matchPercentage);

      const start = offset % 20;
      return scored.slice(start, start + limit);
    },
  };
}

// ─────────────────────────────────────────────
// Shelf 1: New Releases
// ────────────────────��────────────────────────
const newReleasesShelf: ShelfDefinition = {
  id: "new-releases",
  template: false,
  category: "tmdb",
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const genreIds = topGenreIds(profile);

    return [
      buildTmdbInstance(
        "new-releases",
        "New Releases",
        "Fresh titles from the last 30 days",
        "🆕",
        0.7,
        profile,
        (page) => ({
          releaseDateGte: cutoff,
          genreIds: genreIds.length > 0 ? genreIds : undefined,
          sortBy: "popularity.desc",
          page,
        })
      ),
    ];
  },
};

// ─────────────────────────────��───────────────
// Shelf 2: Hidden Gems
// ─────────────────────────��───────────────────
const hiddenGemsShelf: ShelfDefinition = {
  id: "hidden-gems",
  template: false,
  category: "tmdb",
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const genreIds = topGenreIds(profile);

    return [
      buildTmdbInstance(
        "hidden-gems",
        "Hidden Gems",
        "Highly rated but undiscovered",
        "💎",
        0.75,
        profile,
        (page) => ({
          voteCountGte: 50,
          voteCountLte: 500,
          voteAverageGte: 7.0,
          genreIds: genreIds.length > 0 ? genreIds : undefined,
          sortBy: "vote_average.desc",
          page,
        })
      ),
    ];
  },
};

// ─────────────────────────��───────────────────
// Shelf 3: Critics vs Audiences
// ──────────────────────────────────────────���──
const criticsVsAudiencesShelf: ShelfDefinition = {
  id: "critics-vs-audiences",
  template: false,
  category: "tmdb",
  generate(profile: PreferenceProfile): ShelfInstance[] {
    return [
      buildTmdbInstance(
        "critics-vs-audiences",
        "Critics vs Audiences",
        "High ratings, low profile — the overlooked gems",
        "🎭",
        0.65,
        profile,
        (page) => ({
          voteAverageGte: 8.0,
          sortBy: "popularity.asc",
          page,
        })
      ),
    ];
  },
};

// ─────────────────────────���───────────────────
// Shelf 4: Award Winners
// ─────────────────────────────────────────────
const awardWinnersShelf: ShelfDefinition = {
  id: "award-winners",
  template: false,
  category: "tmdb",
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const genreIds = topGenreIds(profile);

    return [
      buildTmdbInstance(
        "award-winners",
        "Award Winners",
        "Academy Award and Golden Globe recognised films",
        "🏆",
        0.7,
        profile,
        (page) => ({
          keywordIds: [ACADEMY_AWARD_KEYWORD_ID, GOLDEN_GLOBE_KEYWORD_ID],
          genreIds: genreIds.length > 0 ? genreIds : undefined,
          sortBy: "vote_average.desc",
          page,
        })
      ),
    ];
  },
};

// ───────────────────────────────────────────���─
// Shelf 5: Decade Picks
// ─────────────────────────────────────────────
const decadePicksShelf: ShelfDefinition = {
  id: "decade-picks",
  template: false,
  category: "tmdb",
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const decade = getMostWatchedDecade();
    const dateGte = `${decade}-01-01`;
    const dateLte = `${decade + 9}-12-31`;

    return [
      buildTmdbInstance(
        "decade-picks",
        `Best of the ${decade}s`,
        `Top-rated films from ${decade}–${decade + 9}`,
        "📅",
        0.65,
        profile,
        (page) => ({
          releaseDateGte: dateGte,
          releaseDateLte: dateLte,
          sortBy: "vote_average.desc",
          voteCountGte: 100,
          page,
        })
      ),
    ];
  },
};

registerShelf(newReleasesShelf);
registerShelf(hiddenGemsShelf);
registerShelf(criticsVsAudiencesShelf);
registerShelf(awardWinnersShelf);
registerShelf(decadePicksShelf);
