/**
 * Plex connection service (api-layer).
 *
 * Ported from the monolith `media/plex/service.ts`, repointed off the
 * `core/settings` RPC onto the pillar-owned `plex_settings` table and env
 * helpers. Token crypto lives in `crypto.ts`; the HTTP client in
 * `client.ts`. Only the connection + auth surface is ported — the sync
 * orchestration stays in the monolith (slices 9b/9c).
 */
import { randomUUID } from 'node:crypto';

import { type MediaDb, plexSettingsService } from '../../../db/index.js';
import { getEnv } from '../env.js';
import { PlexClient } from './client.js';
import { decryptToken } from './crypto.js';
import { PLEX_KEYS } from './keys.js';

export interface PlexSyncStatus {
  configured: boolean;
  hasUrl: boolean;
  hasToken: boolean;
  connected: boolean;
}

export interface PlexSectionIds {
  movieSectionId: string | null;
  tvSectionId: string | null;
}

/** Stable client identifier for plex.tv PIN auth; generated + persisted once. */
export function getPlexClientId(db: MediaDb): string {
  const existing = plexSettingsService.getSetting(db, PLEX_KEYS.clientIdentifier);
  if (existing !== null) return existing;
  const newId = randomUUID();
  plexSettingsService.setSetting(db, PLEX_KEYS.clientIdentifier, newId);
  return newId;
}

/** Resolve the Plex base URL: persisted value, then `PLEX_URL` env, else `null`. */
export function getPlexUrl(db: MediaDb): string | null {
  return plexSettingsService.getSetting(db, PLEX_KEYS.url) ?? getEnv('PLEX_URL') ?? null;
}

/** The persisted Plex username, or `null` when not connected. */
export function getPlexUsername(db: MediaDb): string | null {
  return plexSettingsService.getSetting(db, PLEX_KEYS.username);
}

/**
 * Decrypt the persisted Plex token. Falls back to the raw stored value when
 * decryption fails (legacy unencrypted tokens), matching the monolith.
 */
export function getPlexToken(db: MediaDb): string | null {
  const stored = plexSettingsService.getSetting(db, PLEX_KEYS.token);
  if (stored === null) return null;
  try {
    return decryptToken(db, stored);
  } catch {
    return stored;
  }
}

/** Build a {@link PlexClient}, or `null` when url/token are not both present. */
export function getPlexClient(db: MediaDb): PlexClient | null {
  const url = getPlexUrl(db);
  if (url === null) return null;
  const token = getPlexToken(db);
  if (token === null) return null;
  return new PlexClient(url, token);
}

export function getPlexSectionIds(db: MediaDb): PlexSectionIds {
  return {
    movieSectionId:
      plexSettingsService.getSetting(db, PLEX_KEYS.movieSectionId) ??
      getEnv('PLEX_MOVIE_SECTION_ID') ??
      null,
    tvSectionId:
      plexSettingsService.getSetting(db, PLEX_KEYS.tvSectionId) ??
      getEnv('PLEX_TV_SECTION_ID') ??
      null,
  };
}

export function savePlexSectionIds(
  db: MediaDb,
  movieSectionId?: string,
  tvSectionId?: string
): void {
  if (movieSectionId !== undefined) {
    plexSettingsService.setSetting(db, PLEX_KEYS.movieSectionId, movieSectionId);
  }
  if (tvSectionId !== undefined) {
    plexSettingsService.setSetting(db, PLEX_KEYS.tvSectionId, tvSectionId);
  }
}

/** True when the client can list libraries; false on any upstream error. */
export async function testConnection(client: PlexClient): Promise<boolean> {
  try {
    await client.getLibraries();
    return true;
  } catch {
    return false;
  }
}

/** Connection-config snapshot. `connected` is a static flag (parity with the monolith). */
export function getSyncStatus(db: MediaDb, client: PlexClient | null): PlexSyncStatus {
  return {
    configured: client !== null,
    hasUrl: getPlexUrl(db) !== null,
    hasToken: plexSettingsService.getSetting(db, PLEX_KEYS.token) !== null,
    connected: false,
  };
}
