/**
 * Genre name ↔ TMDB id helpers shared by the genre spotlight and the
 * genre-based shelves: the reverse lookup map, the related-genre guard (so the
 * spotlight doesn't surface two near-duplicate genres), and a top-genre id
 * selector driven by profile affinities.
 *
 * Ported from the monolith `genre-spotlight-service.ts` +
 * `genre-shelves-common.ts` + `tmdb-shelves-helpers.topGenreIds`.
 */
import { TMDB_GENRE_MAP, type PreferenceProfile } from '../../../db/index.js';

/** Genre name → TMDB genre id reverse lookup. */
export const GENRE_NAME_TO_ID = new Map<string, number>(
  Object.entries(TMDB_GENRE_MAP).map(([id, name]): [string, number] => [name, Number(id)])
);

const RELATED_GENRE_PAIRS: [string, string][] = [
  ['Action', 'Adventure'],
  ['Mystery', 'Thriller'],
  ['Drama', 'Romance'],
  ['Fantasy', 'Science Fiction'],
];

/** Whether two genres are near-duplicates that shouldn't both surface together. */
export function areRelated(a: string, b: string): boolean {
  return RELATED_GENRE_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

/** Normalise an affinity score into a 0–1 range relative to a list's bounds. */
export function normalizeScore(score: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (score - min) / (max - min);
}

/** Top-N genre TMDB ids from profile affinities, highest avgScore first. */
export function topGenreIds(profile: PreferenceProfile, limit = 3): number[] {
  return profile.genreAffinities
    .slice()
    .toSorted((a, b) => b.avgScore - a.avgScore)
    .slice(0, limit)
    .map((a) => GENRE_NAME_TO_ID.get(a.genre))
    .filter((id): id is number => id !== undefined);
}
