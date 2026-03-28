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
  type RawPlexMediaContainer,
  type RawPlexLibrariesContainer,
  type RawPlexItemsContainer,
  type RawPlexEpisodesContainer,
  type PlexLibrary,
  type PlexMediaItem,
  type PlexEpisode,
  type PlexExternalId,
  type RawPlexMediaItem,
  type RawPlexEpisode,
} from "./types.js";

export class PlexClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    if (!baseUrl) {
      throw new Error("Plex URL is required");
    }
    if (!token) {
      throw new Error("Plex token is required");
    }
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  /** Get all libraries (sections) from the Plex server. */
  async getLibraries(): Promise<PlexLibrary[]> {
    const raw =
      await this.get<RawPlexMediaContainer<RawPlexLibrariesContainer>>("/library/sections");
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

  /** Get all items in a library section (includes external IDs). */
  async getAllItems(sectionId: string): Promise<PlexMediaItem[]> {
    const raw = await this.get<RawPlexMediaContainer<RawPlexItemsContainer>>(
      `/library/sections/${sectionId}/all?includeGuids=1`
    );
    const items = raw.MediaContainer.Metadata ?? [];
    return items.map((item) => this.mapMediaItem(item));
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

  /** Get all episodes for a TV show by its rating key. */
  async getEpisodes(showRatingKey: string): Promise<PlexEpisode[]> {
    const raw = await this.get<RawPlexMediaContainer<RawPlexEpisodesContainer>>(
      `/library/metadata/${showRatingKey}/allLeaves`
    );
    const episodes = raw.MediaContainer.Metadata ?? [];
    return episodes.map((ep) => this.mapEpisode(ep));
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
  private parseGuids(guids: RawPlexMediaItem["Guid"] | undefined): PlexExternalId[] {
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
    const separator = path.includes("?") ? "&" : "?";
    const url = `${this.baseUrl}${path}${separator}X-Plex-Token=${this.token}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
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
}
