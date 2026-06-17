/**
 * Plex API types for the connection + auth slice.
 *
 * Only the library-listing shapes the connection surface needs are ported
 * here; the sync-related media/episode types stay in the monolith until the
 * sync slices (9b/9c) land. Plex returns XML by default but supports JSON
 * via the `Accept` header; every response wraps its data in a
 * `MediaContainer`.
 */

export class PlexApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'PlexApiError';
  }
}

export interface RawPlexMediaContainer<T> {
  MediaContainer: T;
}

export interface RawPlexLibrary {
  key: string;
  title: string;
  type: string;
  agent: string;
  scanner: string;
  language: string;
  uuid: string;
  updatedAt: number;
  scannedAt: number;
}

export interface RawPlexLibrariesContainer {
  size: number;
  Directory?: RawPlexLibrary[];
}

export interface PlexLibrary {
  key: string;
  title: string;
  type: string;
  agent: string;
  scanner: string;
  language: string;
  uuid: string;
  updatedAt: number;
  scannedAt: number;
}
