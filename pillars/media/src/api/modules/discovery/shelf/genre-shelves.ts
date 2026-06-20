import { getMaxBestInGenre, getMaxCrossoverPairs } from '../config.js';
import { GENRE_NAME_TO_ID, areRelated, normalizeScore } from '../genre-map.js';
import { scoredTmdbShelfQuery } from './shelf-query.js';

/**
 * "Best in {Genre}" + "{Genre} × {Genre}" shelves.
 *
 * Both seed from the user's top genre affinities. Best-in-genre fetches top
 * vote-average movies per genre; crossover blends two non-related genres.
 *
 * Ported from the monolith `shelf/best-in-genre.shelf.ts` +
 * `genre-crossover.shelf.ts`.
 */
import type { GenreAffinity, PreferenceProfile } from '../../../../db/index.js';
import type { DiscoveryDeps } from '../deps.js';
import type { ShelfDefinition, ShelfGenerateArgs, ShelfInstance } from './types.js';

function slug(genre: string): string {
  return genre.toLowerCase().replaceAll(/\s+/g, '-');
}

export const bestInGenreShelf: ShelfDefinition = {
  id: 'best-in-genre',
  template: true,
  category: 'seed',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    const topGenres = profile.genreAffinities
      .slice()
      .toSorted((a, b) => b.avgScore - a.avgScore)
      .slice(0, getMaxBestInGenre())
      .filter((a) => GENRE_NAME_TO_ID.has(a.genre));
    if (topGenres.length === 0) return [];

    const scores = topGenres.map((a) => a.avgScore);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    return topGenres.map((affinity) => {
      const genreId = GENRE_NAME_TO_ID.get(affinity.genre) ?? 0;
      const score = normalizeScore(affinity.avgScore, minScore, maxScore) * 0.8 + 0.1;
      return {
        shelfId: `best-in-genre:${slug(affinity.genre)}`,
        title: `Best in ${affinity.genre}`,
        subtitle: `Top-rated ${affinity.genre} films`,
        emoji: '🎯',
        score,
        query: (opts) =>
          scoredTmdbShelfQuery({
            deps,
            profile,
            opts,
            fetch: (page) =>
              deps.tmdbClient.discoverMovies({
                genreIds: [genreId],
                sortBy: 'vote_average.desc',
                voteCountGte: 50,
                page,
              }),
          }),
      };
    });
  },
};

function pickCrossoverPairs(
  topGenres: GenreAffinity[],
  maxPairs: number
): Array<[GenreAffinity, GenreAffinity]> {
  const pairs: Array<[GenreAffinity, GenreAffinity]> = [];
  for (let i = 0; i < topGenres.length && pairs.length < maxPairs; i++) {
    for (let j = i + 1; j < topGenres.length && pairs.length < maxPairs; j++) {
      const g1 = topGenres[i];
      const g2 = topGenres[j];
      if (!g1 || !g2) continue;
      if (!areRelated(g1.genre, g2.genre)) pairs.push([g1, g2]);
    }
  }
  return pairs;
}

function crossoverInstance(
  deps: DiscoveryDeps,
  profile: PreferenceProfile,
  g1: GenreAffinity,
  g2: GenreAffinity
): ShelfInstance {
  const id1 = GENRE_NAME_TO_ID.get(g1.genre) ?? 0;
  const id2 = GENRE_NAME_TO_ID.get(g2.genre) ?? 0;
  const score = ((g1.avgScore + g2.avgScore) / 2 / 10) * 0.7 + 0.1;
  return {
    shelfId: `genre-crossover:${slug(g1.genre)}-${slug(g2.genre)}`,
    title: `${g1.genre} × ${g2.genre}`,
    subtitle: `Films that blend ${g1.genre} and ${g2.genre}`,
    emoji: '🔀',
    score: Math.min(0.9, score),
    query: (opts) =>
      scoredTmdbShelfQuery({
        deps,
        profile,
        opts,
        fetch: (page) =>
          deps.tmdbClient.discoverMovies({ genreIds: [id1, id2], voteCountGte: 20, page }),
      }),
  };
}

export const genreCrossoverShelf: ShelfDefinition = {
  id: 'genre-crossover',
  template: true,
  category: 'seed',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    const topGenres = profile.genreAffinities
      .slice()
      .toSorted((a, b) => b.avgScore - a.avgScore)
      .slice(0, 6)
      .filter((a) => GENRE_NAME_TO_ID.has(a.genre));
    if (topGenres.length < 2) return [];

    return pickCrossoverPairs(topGenres, getMaxCrossoverPairs()).map(([g1, g2]) =>
      crossoverInstance(deps, profile, g1, g2)
    );
  },
};
