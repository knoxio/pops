/**
 * plex.tv PIN-based auth flow + URL persistence (api-layer).
 *
 * Ported from the monolith `router-auth.ts` / `router-connection.ts`,
 * repointed onto the pillar-owned `plex_settings` table. The PIN endpoints
 * (`https://plex.tv/api/v2/pins`) are hit as direct `fetch` calls carrying
 * the `X-Plex-*` headers, exactly as the monolith did.
 *
 * Errors are raised as the pillar's `HttpError` subclasses so the REST
 * handlers map them to the right status without bespoke branching.
 */
import { type MediaDb, plexSettingsService } from '../../../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { PlexClient } from './client.js';
import { encryptToken } from './crypto.js';
import { PLEX_KEYS } from './keys.js';
import { getPlexClientId } from './service.js';

const PINS_URL = 'https://plex.tv/api/v2/pins';
const PROBE_TIMEOUT_MS = 5000;

export interface AuthPin {
  id: number;
  code: string;
  clientId: string;
}

export interface CheckPinResult {
  connected: boolean;
  username?: string | null;
  expired?: boolean;
}

interface PlexPinResponse {
  id: number;
  code: string;
  authToken?: string | null;
  expiresAt?: string | null;
  username?: string | null;
}

function normalizeUrl(input: string): string {
  let final = input.trim();
  if (!final.startsWith('http://') && !final.startsWith('https://')) {
    final = `http://${final}`;
  }
  try {
    new URL(final);
  } catch {
    throw new ValidationError('Invalid Plex URL');
  }
  return final;
}

async function probeReachability(url: string): Promise<void> {
  try {
    const res = await fetch(`${url}/identity`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok && res.status !== 401) {
      throw new Error(`Server responded with ${res.status}`);
    }
  } catch {
    throw new ConflictError(`Could not reach Plex server at ${url}`);
  }
}

async function validateConnection(url: string, token: string | null): Promise<void> {
  if (token !== null) {
    try {
      await new PlexClient(url, token).getLibraries();
    } catch {
      throw new ConflictError(`Connection to Plex server at ${url} failed`);
    }
    return;
  }
  await probeReachability(url);
}

/** Validate + persist the Plex base URL. Reuses the stored token if present. */
export async function setPlexUrl(db: MediaDb, url: string): Promise<void> {
  const finalUrl = normalizeUrl(url);
  const token = plexSettingsService.getSetting(db, PLEX_KEYS.token);
  await validateConnection(finalUrl, token);
  plexSettingsService.setSetting(db, PLEX_KEYS.url, finalUrl);
}

/** Request a fresh PIN from plex.tv. */
export async function requestAuthPin(db: MediaDb): Promise<AuthPin> {
  const clientId = getPlexClientId(db);
  const res = await fetch(`${PINS_URL}?strong=false`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-Plex-Product': 'POPS',
      'X-Plex-Client-Identifier': clientId,
    },
  });
  if (!res.ok) {
    throw new ConflictError(`Failed to create a Plex PIN (status ${res.status})`);
  }
  const data = (await res.json()) as PlexPinResponse;
  return { id: data.id, code: data.code, clientId };
}

/**
 * Poll plex.tv for the PIN. On an `authToken` the token is encrypted and
 * persisted alongside the username, returning `{ connected: true }`.
 */
export async function checkAuthPin(db: MediaDb, id: number): Promise<CheckPinResult> {
  const clientId = getPlexClientId(db);
  const res = await fetch(`${PINS_URL}/${id}`, {
    headers: { Accept: 'application/json', 'X-Plex-Client-Identifier': clientId },
  });
  if (!res.ok) {
    if (res.status === 404) throw new NotFoundError('Plex PIN', String(id));
    throw new ConflictError(`Failed to check the Plex PIN (status ${res.status})`);
  }

  const data = (await res.json()) as PlexPinResponse;
  if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) {
    return { connected: false, expired: true };
  }
  if (data.authToken) {
    const username = data.username ?? null;
    plexSettingsService.setSetting(db, PLEX_KEYS.token, encryptToken(db, data.authToken));
    if (username !== null) plexSettingsService.setSetting(db, PLEX_KEYS.username, username);
    return { connected: true, username };
  }
  return { connected: false, expired: false };
}

/** Clear the persisted token + username. */
export function disconnect(db: MediaDb): void {
  plexSettingsService.deleteSetting(db, PLEX_KEYS.token);
  plexSettingsService.deleteSetting(db, PLEX_KEYS.username);
}
