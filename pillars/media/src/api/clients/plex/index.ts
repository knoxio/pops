/**
 * Barrel for the Plex connection + auth client.
 *
 * Config is backed by the pillar-owned `plex_settings` table (see
 * `service.ts`) plus env fallbacks; the auth flow hits plex.tv directly
 * (`auth.ts`). Token crypto lives in `crypto.ts`.
 */
export { PlexClient } from './client.js';
export {
  PlexApiError,
  type PlexEpisode,
  type PlexExternalId,
  type PlexLibrary,
  type PlexMediaItem,
} from './types.js';

export {
  getPlexClient,
  getPlexClientId,
  getPlexSectionIds,
  getPlexToken,
  getPlexUrl,
  getPlexUsername,
  getSyncStatus,
  savePlexSectionIds,
  testConnection,
  type PlexSectionIds,
  type PlexSyncStatus,
} from './service.js';

export {
  checkAuthPin,
  disconnect,
  requestAuthPin,
  setPlexUrl,
  type AuthPin,
  type CheckPinResult,
} from './auth.js';

export { encryptToken, decryptToken, getEncryptionKey } from './crypto.js';

export { getTrending as getPlexDiscoverTrending } from './discover.js';

export {
  fetchPlexFriends,
  fetchFriendWatchlist,
  type FriendWatchlistInput,
  type FriendWatchlistMovie,
  type PlexFriend,
} from './friends.js';
