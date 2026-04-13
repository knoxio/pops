/**
 * Register all rotation source adapters.
 *
 * Imported as a side-effect in the media module index.
 */
import { registerSourceAdapter } from './source-registry.js';
import { plexWatchlistSource } from './plex-watchlist-source.js';
import { plexFriendsSource } from './plex-friends-source.js';

registerSourceAdapter(plexWatchlistSource);
registerSourceAdapter(plexFriendsSource);
