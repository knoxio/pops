/**
 * Plex Media Server HTTP client — connection slice.
 *
 * Typed wrapper around the Plex Media Server API (authenticated via the
 * `X-Plex-Token` query param). This slice ports only the library-listing
 * surface the connection/auth flow needs (`getLibraries`, used by the
 * connection test); the sync media/episode methods stay in the monolith
 * until slices 9b/9c.
 *
 * Plex API docs: https://github.com/Arcanemagus/plex-api/wiki
 */
import {
  PlexApiError,
  type PlexLibrary,
  type RawPlexLibrariesContainer,
  type RawPlexMediaContainer,
} from './types.js';

async function getPath<T>(baseUrl: string, token: string, path: string): Promise<T> {
  const url = `${baseUrl}${path}${path.includes('?') ? '&' : '?'}X-Plex-Token=${encodeURIComponent(token)}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new PlexApiError(0, `Plex request failed: ${message}`);
  }
  if (!response.ok) {
    throw new PlexApiError(response.status, `Plex API error: ${response.status} ${path}`);
  }
  return (await response.json()) as T;
}

export class PlexClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    if (!baseUrl) throw new Error('Plex URL is required');
    if (!token) throw new Error('Plex token is required');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  /** Get all libraries (sections) from the Plex server. */
  async getLibraries(): Promise<PlexLibrary[]> {
    const raw = await getPath<RawPlexMediaContainer<RawPlexLibrariesContainer>>(
      this.baseUrl,
      this.token,
      '/library/sections'
    );
    const dirs = raw.MediaContainer.Directory ?? [];
    return dirs.map((d) => ({
      key: d.key,
      title: d.title,
      type: d.type,
      agent: d.agent,
      scanner: d.scanner,
      language: d.language,
      uuid: d.uuid,
      updatedAt: d.updatedAt,
      scannedAt: d.scannedAt,
    }));
  }
}
