/**
 * Shared shelf query pipeline: fetch a TMDB page, annotate with flag sets,
 * drop dismissed, score by the profile, and page-slice.
 *
 * Most seeded / genre / tmdb shelves share this exact shape (the monolith
 * duplicated it per shelf); centralised here so a single mapper governs the
 * wire shape. The `fetch` callback isolates the per-shelf TMDB call.
 */
import { discoveryService, type PreferenceProfile } from '../../../../db/index.js';
import { loadFlagSets, type DiscoveryDeps } from '../deps.js';
import { toDiscoverResults } from '../discover-result-mapper.js';

import type { DiscoverResult, ScoredDiscoverResult } from '../../../../db/index.js';
import type { TmdbSearchResponse } from '../../../clients/tmdb/types.js';
import type { ShelfQueryOpts } from './types.js';

const TMDB_PAGE_SIZE = 20;

/** Page number a 0-based offset falls into, for a 20-item TMDB page. */
export function tmdbPageFor(offset: number): number {
  return Math.floor(offset / TMDB_PAGE_SIZE) + 1;
}

interface ScoredShelfArgs {
  deps: DiscoveryDeps;
  profile: PreferenceProfile;
  opts: ShelfQueryOpts;
  fetch: (page: number) => Promise<TmdbSearchResponse>;
}

/** Fetch → flag → drop-dismissed → profile-score → slice. */
export async function scoredTmdbShelfQuery(args: ScoredShelfArgs): Promise<ScoredDiscoverResult[]> {
  const { deps, profile, opts, fetch } = args;
  const page = tmdbPageFor(opts.offset);
  const response = await fetch(page);
  const flags = loadFlagSets(deps.db);
  const raw: DiscoverResult[] = toDiscoverResults(response.results, flags);
  const scored = discoveryService.scoreDiscoverResults(raw, profile);
  const start = opts.offset % TMDB_PAGE_SIZE;
  return scored.slice(start, start + opts.limit);
}

/** Same as {@link scoredTmdbShelfQuery} but without profile scoring (raw order). */
export async function rawTmdbShelfQuery(
  args: Omit<ScoredShelfArgs, 'profile'>
): Promise<DiscoverResult[]> {
  const { deps, opts, fetch } = args;
  const page = tmdbPageFor(opts.offset);
  const response = await fetch(page);
  const flags = loadFlagSets(deps.db);
  const raw = toDiscoverResults(response.results, flags);
  const start = opts.offset % TMDB_PAGE_SIZE;
  return raw.slice(start, start + opts.limit);
}
