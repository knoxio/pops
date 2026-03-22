/**
 * Plex API types — raw API responses and mapped domain types.
 *
 * Plex returns XML by default but supports JSON via Accept header.
 * All responses wrap data in a MediaContainer object.
 */

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class PlexApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "PlexApiError";
  }
}

// ---------------------------------------------------------------------------
// Raw Plex API response types (JSON format)
// ---------------------------------------------------------------------------

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
  Directory: RawPlexLibrary[];
}

export interface RawPlexGuid {
  id: string; // e.g. "tmdb://550" or "imdb://tt0137523" or "tvdb://81189"
}

export interface RawPlexMediaItem {
  ratingKey: string;
  key: string;
  guid: string;
  type: string;
  title: string;
  originalTitle?: string;
  summary?: string;
  tagline?: string;
  year?: number;
  thumb?: string;
  art?: string;
  duration?: number;
  addedAt: number;
  updatedAt: number;
  lastViewedAt?: number;
  viewCount?: number;
  rating?: number;
  audienceRating?: number;
  contentRating?: string;
  Guid?: RawPlexGuid[];
  Genre?: { tag: string }[];
  Director?: { tag: string }[];
  Role?: { tag: string; role?: string; thumb?: string }[];
  leafCount?: number;
  viewedLeafCount?: number;
  childCount?: number;
}

export interface RawPlexItemsContainer {
  size: number;
  totalSize?: number;
  Metadata?: RawPlexMediaItem[];
}

export interface RawPlexEpisode {
  ratingKey: string;
  key: string;
  parentRatingKey: string;
  grandparentRatingKey: string;
  type: string;
  title: string;
  index: number;
  parentIndex: number;
  summary?: string;
  thumb?: string;
  duration?: number;
  addedAt: number;
  updatedAt: number;
  lastViewedAt?: number;
  viewCount?: number;
}

export interface RawPlexEpisodesContainer {
  size: number;
  Metadata?: RawPlexEpisode[];
}

// ---------------------------------------------------------------------------
// Mapped domain types
// ---------------------------------------------------------------------------

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

export interface PlexExternalId {
  source: string; // "tmdb", "imdb", "tvdb"
  id: string;
}

export interface PlexMediaItem {
  ratingKey: string;
  type: string;
  title: string;
  originalTitle: string | null;
  summary: string | null;
  tagline: string | null;
  year: number | null;
  thumbUrl: string | null;
  artUrl: string | null;
  durationMs: number | null;
  addedAt: number;
  updatedAt: number;
  lastViewedAt: number | null;
  viewCount: number;
  rating: number | null;
  audienceRating: number | null;
  contentRating: string | null;
  externalIds: PlexExternalId[];
  genres: string[];
  directors: string[];
  /** For TV shows: total episode count */
  leafCount: number | null;
  /** For TV shows: watched episode count */
  viewedLeafCount: number | null;
  /** For TV shows: season count */
  childCount: number | null;
}

export interface PlexEpisode {
  ratingKey: string;
  title: string;
  episodeIndex: number;
  seasonIndex: number;
  summary: string | null;
  thumbUrl: string | null;
  durationMs: number | null;
  addedAt: number;
  updatedAt: number;
  lastViewedAt: number | null;
  viewCount: number;
}
