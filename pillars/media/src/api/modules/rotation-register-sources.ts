/**
 * Register all rotation source adapters.
 *
 * Imported for its side-effect by the source-sync orchestration so the
 * registry is populated before the first lookup.
 */
import { registerSourceAdapter } from './rotation-source-registry.js';
import { letterboxdSource } from './rotation-sources/letterboxd.js';
import { plexFriendsSource } from './rotation-sources/plex-friends.js';
import { plexWatchlistSource } from './rotation-sources/plex-watchlist.js';
import { tmdbTopRatedSource } from './rotation-sources/tmdb-top-rated.js';

let registered = false;

/** Idempotently register the built-in rotation source adapters. */
export function registerRotationSources(): void {
  if (registered) return;
  registerSourceAdapter(plexWatchlistSource);
  registerSourceAdapter(plexFriendsSource);
  registerSourceAdapter(tmdbTopRatedSource);
  registerSourceAdapter(letterboxdSource);
  registered = true;
}
