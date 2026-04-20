import * as discover from './client-discover.js';
/**
 * Plex API HTTP client — typed wrapper around the Plex Media Server API.
 *
 * Handles authentication (X-Plex-Token query param), request construction,
 * response parsing, and error mapping. Contains no business logic.
 *
 * Plex API docs: https://github.com/Arcanemagus/plex-api/wiki
 *
 * Sub-modules:
 *  - client-http.ts      — fetch helpers (getPath, getAbsolute, putAbsolute)
 *  - client-mappers.ts   — RawPlex* → PlexMediaItem/PlexEpisode mappers
 *  - client-discover.ts  — Plex Discover (cloud) endpoints
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
    while (true) {
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
    const items = raw.MediaContainer.Metadata ?? [];
    const first = items[0];
    if (!first) throw new PlexApiError(404, `Item ${ratingKey} not found`);
    return mapMediaItem(first);
  }

  /** Get all episodes for a TV show by its rating key. Paginates automatically. */
  async getEpisodes(showRatingKey: string): Promise<PlexEpisode[]> {
    const allEpisodes: PlexEpisode[] = [];
    let start = 0;
    while (true) {
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

  // -------------------------------------------------------------------------
  // Plex Discover (cloud) endpoints — delegated to client-discover.ts
  // -------------------------------------------------------------------------

  /** Add an item to the Plex cloud watchlist by discover ratingKey. */
  addToWatchlist(ratingKey: string): Promise<void> {
    return discover.addToWatchlist(this.token, ratingKey);
  }

  /** Remove an item from the Plex cloud watchlist by discover ratingKey. */
  removeFromWatchlist(ratingKey: string): Promise<void> {
    return discover.removeFromWatchlist(this.token, ratingKey);
  }

  /** Get the user's watch state for a Discover item. */
  getUserState(
    discoverRatingKey: string
  ): Promise<{ viewCount: number; lastViewedAt: number | null } | null> {
    return discover.getUserState(this.token, discoverRatingKey);
  }

  /** Search the Plex Discover API by title and media type. */
  searchDiscover(query: string, searchType: 'movie' | 'show'): Promise<PlexMediaItem[]> {
    return discover.searchDiscover(this.token, query, searchType);
  }

  /** Fetch full metadata for a Discover item by its ratingKey. */
  getDiscoverMetadata(ratingKey: string): Promise<PlexMediaItem | null> {
    return discover.getDiscoverMetadata(this.token, ratingKey);
  }

  /** Fetch trending/popular movies from the Plex Discover API. */
  getTrending(limit: number = 20): Promise<PlexMediaItem[]> {
    return discover.getTrending(this.token, limit);
  }
}
