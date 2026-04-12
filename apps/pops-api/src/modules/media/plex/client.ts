/**
 * Plex API HTTP client — typed wrapper around the Plex Media Server API.
 *
 * Handles authentication (X-Plex-Token query param), request construction,
 * response parsing, and error mapping. Contains no business logic.
 *
 * Plex API docs: https://github.com/Arcanemagus/plex-api/wiki
 */
import {
  PlexApiError,
  type PlexEpisode,
  type PlexExternalId,
  type PlexLibrary,
  type PlexMediaItem,
  type RawPlexEpisode,
  type RawPlexEpisodesContainer,
  type RawPlexItemsContainer,
  type RawPlexLibrariesContainer,
  type RawPlexMediaContainer,
  type RawPlexMediaItem,
} from './types.js';

export class PlexClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    if (!baseUrl) {
      throw new Error('Plex URL is required');
    }
    if (!token) {
      throw new Error('Plex token is required');
    }
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  /** Get all libraries (sections) from the Plex server. */
  async getLibraries(): Promise<PlexLibrary[]> {
    const raw =
      await this.get<RawPlexMediaContainer<RawPlexLibrariesContainer>>('/library/sections');
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
    const pageSize = 100;

    while (true) {
      const raw = await this.get<RawPlexMediaContainer<RawPlexItemsContainer>>(
        `/library/sections/${sectionId}/all?includeGuids=1&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`
      );
      const container = raw.MediaContainer;
      const items = container.Metadata ?? [];
      allItems.push(...items.map((item) => this.mapMediaItem(item)));

      const totalSize = container.totalSize ?? items.length;
      start += items.length;
      if (start >= totalSize || items.length === 0) break;
    }

    return allItems;
  }

  /** Get detail for a single item by rating key. */
  async getItemDetail(ratingKey: string): Promise<PlexMediaItem> {
    const raw = await this.get<RawPlexMediaContainer<RawPlexItemsContainer>>(
      `/library/metadata/${ratingKey}`
    );
    const items = raw.MediaContainer.Metadata ?? [];
    const first = items[0];
    if (!first) {
      throw new PlexApiError(404, `Item ${ratingKey} not found`);
    }
    return this.mapMediaItem(first);
  }

  /** Get all episodes for a TV show by its rating key. Paginates automatically. */
  async getEpisodes(showRatingKey: string): Promise<PlexEpisode[]> {
    const allEpisodes: PlexEpisode[] = [];
    let start = 0;
    const pageSize = 100;

    while (true) {
      const raw = await this.get<RawPlexMediaContainer<RawPlexEpisodesContainer>>(
        `/library/metadata/${showRatingKey}/allLeaves?X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`
      );
      const container = raw.MediaContainer;
      const episodes = container.Metadata ?? [];
      allEpisodes.push(...episodes.map((ep) => this.mapEpisode(ep)));

      const totalSize = container.totalSize ?? episodes.length;
      start += episodes.length;
      if (start >= totalSize || episodes.length === 0) break;
    }

    return allEpisodes;
  }

  // -------------------------------------------------------------------------
  // Plex Discover (cloud) watchlist API
  // -------------------------------------------------------------------------

  /** Add an item to the Plex cloud watchlist by discover ratingKey. */
  async addToWatchlist(ratingKey: string): Promise<void> {
    await this.put(
      `https://discover.provider.plex.tv/actions/addToWatchlist?ratingKey=${ratingKey}`
    );
  }

  /** Remove an item from the Plex cloud watchlist by discover ratingKey. */
  async removeFromWatchlist(ratingKey: string): Promise<void> {
    await this.put(
      `https://discover.provider.plex.tv/actions/removeFromWatchlist?ratingKey=${ratingKey}`
    );
  }

  /**
   * Get the user's watch state for a Discover item.
   * Returns viewCount (0 = not watched) and lastViewedAt if available.
   * Returns null if the item has no user state (never interacted with).
   */
  async getUserState(
    discoverRatingKey: string
  ): Promise<{ viewCount: number; lastViewedAt: number | null } | null> {
    const url =
      `https://metadata.provider.plex.tv/library/metadata/${discoverRatingKey}/userState` +
      `?X-Plex-Token=${this.token}`;

    try {
      const data = await this.getAbsolute<{
        MediaContainer: {
          UserState?:
            | { viewCount?: number; lastViewedAt?: number }
            | Array<{ viewCount?: number; lastViewedAt?: number }>;
        };
      }>(url);

      // Plex API returns UserState as either an object or an array
      const raw = data.MediaContainer.UserState;
      if (!raw) return null;
      const state = Array.isArray(raw) ? raw[0] : raw;
      if (!state) return null;

      return {
        viewCount: state.viewCount ?? 0,
        lastViewedAt: state.lastViewedAt ?? null,
      };
    } catch {
      // 404 or network error — item has no user state
      return null;
    }
  }

  /**
   * Search the Plex Discover API by title and media type.
   * Returns items with ratingKeys but without external IDs (Guid arrays).
   * Use getDiscoverMetadata() to fetch Guids for a specific item.
   */
  async searchDiscover(query: string, searchType: 'movie' | 'show'): Promise<PlexMediaItem[]> {
    const typeParam = searchType === 'movie' ? 'movies' : 'tv';
    const url =
      `https://discover.provider.plex.tv/library/search` +
      `?query=${encodeURIComponent(query)}` +
      `&searchTypes=${typeParam}` +
      `&searchProviders=discover` +
      `&limit=5` +
      `&X-Plex-Token=${this.token}`;

    const data = await this.getAbsolute<{
      MediaContainer: {
        SearchResults?: Array<{
          SearchResult?: Array<{
            Metadata?: RawPlexMediaItem;
          }>;
        }>;
      };
    }>(url);

    const searchResults = data.MediaContainer.SearchResults ?? [];
    const items: PlexMediaItem[] = [];
    for (const group of searchResults) {
      for (const result of group.SearchResult ?? []) {
        if (result.Metadata) {
          items.push(this.mapMediaItem(result.Metadata));
        }
      }
    }
    return items;
  }

  /**
   * Fetch full metadata for a Discover item by its ratingKey.
   * Includes Guid array (tmdb://, tvdb://, imdb://) for ID matching.
   */
  async getDiscoverMetadata(ratingKey: string): Promise<PlexMediaItem | null> {
    const url =
      `https://metadata.provider.plex.tv/library/metadata/${ratingKey}` +
      `?includeGuids=1` +
      `&X-Plex-Token=${this.token}`;

    try {
      const data = await this.getAbsolute<{
        MediaContainer: {
          Metadata?: RawPlexMediaItem[];
        };
      }>(url);

      const item = data.MediaContainer.Metadata?.[0];
      return item ? this.mapMediaItem(item) : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch trending/popular movies from the Plex Discover API.
   * Uses the online media hub to discover popular content across the Plex ecosystem.
   */
  async getTrending(limit: number = 20): Promise<PlexMediaItem[]> {
    const url =
      `https://discover.provider.plex.tv/library/sections/watchlist/all` +
      `?type=1` +
      `&sort=popularityMonth:desc` +
      `&limit=${limit}` +
      `&includeGuids=1` +
      `&X-Plex-Token=${this.token}`;

    try {
      const data = await this.getAbsolute<{
        MediaContainer: {
          Metadata?: RawPlexMediaItem[];
        };
      }>(url);

      return (data.MediaContainer.Metadata ?? []).map((item) => this.mapMediaItem(item));
    } catch {
      // Fallback: try the hub endpoint for popular content
      const hubUrl =
        `https://discover.provider.plex.tv/hubs/promoted` +
        `?count=${limit}` +
        `&includeGuids=1` +
        `&X-Plex-Token=${this.token}`;

      const hubData = await this.getAbsolute<{
        MediaContainer: {
          Hub?: Array<{
            type: string;
            Metadata?: RawPlexMediaItem[];
          }>;
        };
      }>(hubUrl);

      const hubs = hubData.MediaContainer.Hub ?? [];
      const movieItems: PlexMediaItem[] = [];
      for (const hub of hubs) {
        for (const item of hub.Metadata ?? []) {
          if (item.type === 'movie') {
            movieItems.push(this.mapMediaItem(item));
          }
          if (movieItems.length >= limit) break;
        }
        if (movieItems.length >= limit) break;
      }
      return movieItems.slice(0, limit);
    }
  }

  // -------------------------------------------------------------------------
  // Mappers
  // -------------------------------------------------------------------------

  private mapMediaItem(raw: RawPlexMediaItem): PlexMediaItem {
    return {
      ratingKey: raw.ratingKey,
      type: raw.type,
      title: raw.title,
      originalTitle: raw.originalTitle ?? null,
      summary: raw.summary ?? null,
      tagline: raw.tagline ?? null,
      year: raw.year ?? null,
      thumbUrl: raw.thumb ?? null,
      artUrl: raw.art ?? null,
      durationMs: raw.duration ?? null,
      addedAt: raw.addedAt,
      updatedAt: raw.updatedAt,
      lastViewedAt: raw.lastViewedAt ?? null,
      viewCount: raw.viewCount ?? 0,
      rating: raw.rating ?? null,
      audienceRating: raw.audienceRating ?? null,
      contentRating: raw.contentRating ?? null,
      externalIds: this.parseGuids(raw.Guid),
      genres: (raw.Genre ?? []).map((g) => g.tag),
      directors: (raw.Director ?? []).map((d) => d.tag),
      leafCount: raw.leafCount ?? null,
      viewedLeafCount: raw.viewedLeafCount ?? null,
      childCount: raw.childCount ?? null,
    };
  }

  private mapEpisode(raw: RawPlexEpisode): PlexEpisode {
    return {
      ratingKey: raw.ratingKey,
      title: raw.title,
      episodeIndex: raw.index,
      seasonIndex: raw.parentIndex,
      summary: raw.summary ?? null,
      thumbUrl: raw.thumb ?? null,
      durationMs: raw.duration ?? null,
      addedAt: raw.addedAt,
      updatedAt: raw.updatedAt,
      lastViewedAt: raw.lastViewedAt ?? null,
      viewCount: raw.viewCount ?? 0,
    };
  }

  /** Parse Plex Guid array into structured external IDs. */
  private parseGuids(guids: RawPlexMediaItem['Guid'] | undefined): PlexExternalId[] {
    if (!guids) return [];
    return guids
      .map((g) => {
        const match = g.id.match(/^(\w+):\/\/(.+)$/);
        if (!match) return null;
        return { source: match[1], id: match[2] };
      })
      .filter((id): id is PlexExternalId => id !== null);
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  /** Generic GET with X-Plex-Token and error handling. */
  private async get<T>(path: string): Promise<T> {
    const separator = path.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${path}${separator}X-Plex-Token=${this.token}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
    } catch (err) {
      throw new PlexApiError(
        0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      let message = `Plex API error: ${response.status} ${response.statusText}`;
      try {
        const text = await response.text();
        if (text) {
          message = text;
        }
      } catch {
        // Ignore parse failures
      }
      throw new PlexApiError(response.status, message);
    }

    return (await response.json()) as T;
  }

  /** Generic GET for cloud API endpoints (absolute URLs, token already in query). */
  private async getAbsolute<T>(absoluteUrl: string): Promise<T> {
    let response: Response;

    try {
      response = await fetch(absoluteUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
    } catch (err) {
      throw new PlexApiError(
        0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      let message = `Plex API error: ${response.status} ${response.statusText}`;
      try {
        const text = await response.text();
        if (text) {
          message = text;
        }
      } catch {
        // Ignore parse failures
      }
      throw new PlexApiError(response.status, message);
    }

    return (await response.json()) as T;
  }

  /** Generic PUT for cloud API endpoints (absolute URLs). */
  private async put(absoluteUrl: string): Promise<void> {
    const separator = absoluteUrl.includes('?') ? '&' : '?';
    const url = `${absoluteUrl}${separator}X-Plex-Token=${this.token}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
        },
      });
    } catch (err) {
      throw new PlexApiError(
        0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      let message = `Plex API error: ${response.status} ${response.statusText}`;
      try {
        const text = await response.text();
        if (text) {
          message = text;
        }
      } catch {
        // Ignore parse failures
      }
      throw new PlexApiError(response.status, message);
    }
  }
}
