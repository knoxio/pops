/**
 * Register all rotation source adapters.
 *
 * Imported as a side-effect in the media module index.
 */
import { letterboxdSource } from './letterboxd-source.js';
import { plexFriendsSource } from './plex-friends-source.js';
import { plexWatchlistSource } from './plex-watchlist-source.js';
import { registerSourceAdapter } from './source-registry.js';
import { tmdbTopRatedSource } from './tmdb-top-rated-source.js';

registerSourceAdapter(plexWatchlistSource);
registerSourceAdapter(plexFriendsSource);
registerSourceAdapter(tmdbTopRatedSource);
registerSourceAdapter(letterboxdSource);
