import { getSettingValue } from '../../../core/settings/service.js';
import { TMDB_GENRE_MAP } from '../types.js';

import type { PreferenceProfile } from '../types.js';

export function getMaxBestInGenre(): number {
  return getSettingValue('media.discovery.maxBestInGenre', 5);
}
export function getMaxCrossoverPairs(): number {
  return getSettingValue('media.discovery.maxCrossoverPairs', 6);
}
export const MAX_TOP_DIMENSION = 5;
export const MAX_DIMENSION_INSPIRED = 3;

const RELATED_GENRE_PAIRS = new Set([
  'Action+Adventure',
  'Adventure+Action',
  'Mystery+Thriller',
  'Thriller+Mystery',
  'Drama+Romance',
  'Romance+Drama',
  'Fantasy+Science Fiction',
  'Science Fiction+Fantasy',
]);

export function isRelatedPair(genre1: string, genre2: string): boolean {
  return RELATED_GENRE_PAIRS.has(`${genre1}+${genre2}`);
}

/** Reverse map: genre name → TMDB genre ID */
export const GENRE_NAME_TO_ID = new Map<string, number>(
  Object.entries(TMDB_GENRE_MAP).map(([id, name]) => [name, Number(id)])
);

/** Normalize affinity score to 0–1 range for a given list. */
export function normalizeScore(score: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (score - min) / (max - min);
}

export interface DimensionSeed {
  dimensionId: number;
  name: string;
  avgScore: number;
}

export function getActiveDimensions(profile: PreferenceProfile): DimensionSeed[] {
  return profile.dimensionWeights
    .filter((d) => d.comparisonCount >= 5)
    .toSorted((a, b) => b.comparisonCount - a.comparisonCount)
    .slice(0, MAX_TOP_DIMENSION)
    .map((d) => ({ dimensionId: d.dimensionId, name: d.name, avgScore: d.avgScore }));
}
