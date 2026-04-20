import { eq } from 'drizzle-orm';

import { movies } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { logWatch } from '../watch-history/service.js';
import { getPlexToken } from './service.js';
import { fetchActivityForItem } from './sync-discover-graphql.js';
import { extractExternalIdAsNumber } from './sync-helpers.js';

import type { PlexClient } from './client.js';

interface FindRatingKeyArgs {
  plexClient: PlexClient;
  title: string;
  tmdbId: number;
}

async function findRatingKey(args: FindRatingKeyArgs): Promise<string | null> {
  const { plexClient, title, tmdbId } = args;
  const results = await plexClient.searchDiscover(title, 'movie');
  if (results.length === 0) return null;
  for (const item of results) {
    const meta = await plexClient.getDiscoverMetadata(item.ratingKey);
    if (!meta) continue;
    const id = extractExternalIdAsNumber(meta, 'tmdb');
    if (id === tmdbId) return item.ratingKey;
  }
  return null;
}

function logFromActivityNodes(
  movieId: number,
  nodes: Array<{ date: string }>,
  fallbackDate: string
): boolean {
  if (nodes.length === 0) {
    logWatch({
      mediaType: 'movie',
      mediaId: movieId,
      watchedAt: fallbackDate,
      completed: 1,
      source: 'plex_sync',
    });
    return true;
  }
  let logged = false;
  for (const node of nodes) {
    const result = logWatch({
      mediaType: 'movie',
      mediaId: movieId,
      watchedAt: node.date,
      completed: 1,
      source: 'plex_sync',
    });
    if (result.created) logged = true;
  }
  return logged;
}

/**
 * Check if a movie is watched on Plex Discover and log the watch if so.
 * Best-effort — returns false on any error without throwing.
 */
export async function checkAndLogMovieWatch(
  plexClient: PlexClient,
  movieId: number,
  title: string,
  tmdbId: number
): Promise<boolean> {
  try {
    const token = getPlexToken();
    if (!token) return false;

    const ratingKey = await findRatingKey({ plexClient, title, tmdbId });
    if (!ratingKey) return false;

    const db = getDrizzle();
    db.update(movies).set({ discoverRatingKey: ratingKey }).where(eq(movies.id, movieId)).run();

    const state = await plexClient.getUserState(ratingKey);
    if (!state || state.viewCount === 0) return false;

    const nodes = await fetchActivityForItem(token, ratingKey);
    const fallbackDate = state.lastViewedAt
      ? new Date(state.lastViewedAt * 1000).toISOString()
      : new Date().toISOString();
    return logFromActivityNodes(movieId, nodes, fallbackDate);
  } catch {
    return false;
  }
}
