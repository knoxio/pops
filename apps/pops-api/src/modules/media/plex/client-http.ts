import { PlexApiError } from './types.js';

async function readErrorMessage(response: Response): Promise<string> {
  let message = `Plex API error: ${response.status} ${response.statusText}`;
  try {
    const text = await response.text();
    if (text) message = text;
  } catch {
    // Ignore parse failures
  }
  return message;
}

async function performFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new PlexApiError(0, `Network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Generic GET for cloud API endpoints (absolute URLs, token already in query). */
export async function getAbsolute<T>(absoluteUrl: string): Promise<T> {
  const response = await performFetch(absoluteUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new PlexApiError(response.status, await readErrorMessage(response));
  }
  return (await response.json()) as T;
}

/** Generic GET for the Plex Media Server API; appends the token query param. */
export async function getPath<T>(baseUrl: string, token: string, path: string): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${baseUrl}${path}${separator}X-Plex-Token=${token}`;
  return getAbsolute<T>(url);
}

/** Generic PUT for cloud API endpoints (absolute URLs); appends the token query param. */
export async function putAbsolute(absoluteUrl: string, token: string): Promise<void> {
  const separator = absoluteUrl.includes('?') ? '&' : '?';
  const url = `${absoluteUrl}${separator}X-Plex-Token=${token}`;
  const response = await performFetch(url, {
    method: 'PUT',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new PlexApiError(response.status, await readErrorMessage(response));
  }
}
