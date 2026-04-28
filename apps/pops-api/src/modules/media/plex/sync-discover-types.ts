export interface DiscoverItemResult {
  total: number;
  watched: number;
  logged: number;
  alreadyLogged: number;
  added: number;
  notFound: number;
  errors: number;
  errorSamples: string[];
}

export type DiscoverMovieResult = DiscoverItemResult;
export type DiscoverTvShowResult = DiscoverItemResult;

export interface DiscoverWatchSyncResult {
  movies: DiscoverItemResult;
  tvShows: DiscoverItemResult;
}

const MAX_ERROR_SAMPLES = 5;

export function makeEmptyResult(): DiscoverItemResult {
  return {
    total: 0,
    watched: 0,
    logged: 0,
    alreadyLogged: 0,
    added: 0,
    notFound: 0,
    errors: 0,
    errorSamples: [],
  };
}

export function pushError(result: DiscoverItemResult, title: string, err: unknown): void {
  result.errors++;
  if (result.errorSamples.length < MAX_ERROR_SAMPLES) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errorSamples.push(`${title}: ${msg}`);
  }
}

import { getSettingValue } from '../../core/settings/service.js';

export const RATE_LIMIT_DELAY_MS = 200;

export function getRateLimitDelayMs(): number {
  return getSettingValue('media.plex.rateLimitDelayMs', RATE_LIMIT_DELAY_MS);
}

export const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
