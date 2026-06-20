/**
 * Plex Media Server HTTP client.
 *
 * Typed wrapper around the Plex Media Server API (authenticated via the
 * `X-Plex-Token` query param). The connection surface (`getLibraries`,
 * slice 9a) and the sync surface (`getAllItems` / `getItemDetail` /
 * `getEpisodes`, slice 9b) live here; the Plex Discover (cloud) endpoints
 * stay deferred until the rotation/discover domain lands (wave 3).
 *
 * Sub-modules:
 *  - client-http.ts    — fetch helpers (getPath, getAbsolute, putAbsolute)
 *  - client-mappers.ts — RawPlex* → PlexMediaItem/PlexEpisode mappers
 *
 * Plex API docs: https://github.com/Arcanemagus/plex-api/wiki
 */
import { getPath } from './client-http.js';
import { mapEpisode, mapMediaItem } from './client-mappers.js';
import {
  PlexApiError,
  type PlexEpisode,
  type PlexLibrary,
  type PlexMediaItem,
  type RawPlexEpisodesContainer,
  type RawPlexItemsContainer,
  type RawPlexLibrariesContainer,
  type RawPlexMediaContainer,
} from './types.js';

const PAGE_SIZE = 100;

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

  /** Get all items in a library section (includes external IDs). Paginates automatically. */
  async getAllItems(sectionId: string): Promise<PlexMediaItem[]> {
    const allItems: PlexMediaItem[] = [];
    let start = 0;
    for (;;) {
      const raw = await getPath<RawPlexMediaContainer<RawPlexItemsContainer>>(
        this.baseUrl,
        this.token,
        `/library/sections/${sectionId}/all?includeGuids=1&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${PAGE_SIZE}`
      );
      const container = raw.MediaContainer;
      const items = container.Metadata ?? [];
      allItems.push(...items.map(mapMediaItem));
      const totalSize = container.totalSize ?? items.length;
      start += items.length;
      if (start >= totalSize || items.length === 0) break;
    }
    return allItems;
  }

  /** Get detail for a single item by rating key. */
  async getItemDetail(ratingKey: string): Promise<PlexMediaItem> {
    const raw = await getPath<RawPlexMediaContainer<RawPlexItemsContainer>>(
      this.baseUrl,
      this.token,
      `/library/metadata/${ratingKey}`
    );
    const first = (raw.MediaContainer.Metadata ?? [])[0];
    if (!first) throw new PlexApiError(404, `Item ${ratingKey} not found`);
    return mapMediaItem(first);
  }

  /** Get all episodes for a TV show by its rating key. Paginates automatically. */
  async getEpisodes(showRatingKey: string): Promise<PlexEpisode[]> {
    const allEpisodes: PlexEpisode[] = [];
    let start = 0;
    for (;;) {
      const raw = await getPath<RawPlexMediaContainer<RawPlexEpisodesContainer>>(
        this.baseUrl,
        this.token,
        `/library/metadata/${showRatingKey}/allLeaves?X-Plex-Container-Start=${start}&X-Plex-Container-Size=${PAGE_SIZE}`
      );
      const container = raw.MediaContainer;
      const eps = container.Metadata ?? [];
      allEpisodes.push(...eps.map(mapEpisode));
      const totalSize = container.totalSize ?? eps.length;
      start += eps.length;
      if (start >= totalSize || eps.length === 0) break;
    }
    return allEpisodes;
  }
}
