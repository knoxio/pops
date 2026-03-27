/**
 * Shared types for Radarr/Sonarr *arr API integration.
 */

/** Possible status values for a movie/show in the *arr system. */
export type ArrStatus =
  | "available"
  | "monitored"
  | "downloading"
  | "unmonitored"
  | "complete"
  | "partial"
  | "not_found"
  | "unavailable";

/** Status result returned to the frontend. */
export interface ArrStatusResult {
  status: ArrStatus;
  /** Human-readable label, e.g. "Available", "Downloading 45%" */
  label: string;
  /** Progress percentage (0-100) when downloading. */
  progress?: number;
  /** Episode stats for TV shows, e.g. "45/62 episodes" */
  episodeStats?: string;
}

/** Configuration state for arr services. */
export interface ArrConfig {
  radarrConfigured: boolean;
  sonarrConfigured: boolean;
}

/** Error from an *arr API call. */
export class ArrApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ArrApiError";
    this.status = status;
  }
}

// -- Radarr response types --

export interface RadarrMovie {
  id: number;
  title: string;
  tmdbId: number;
  monitored: boolean;
  hasFile: boolean;
}

export interface RadarrQualityProfile {
  id: number;
  name: string;
}

export interface RadarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export interface RadarrAddMovieInput {
  tmdbId: number;
  title: string;
  qualityProfileId: number;
  rootFolderPath: string;
}

export interface RadarrCheckResult {
  exists: boolean;
  radarrId?: number;
  monitored?: boolean;
}

export interface RadarrCommandResponse {
  id: number;
  name: string;
  status: string;
}

export interface RadarrQueueRecord {
  id: number;
  movieId: number;
  title: string;
  status: string;
  sizeleft: number;
  size: number;
}

export interface RadarrQueueResponse {
  totalRecords: number;
  records: RadarrQueueRecord[];
}

// -- Sonarr response types --

export interface SonarrSeries {
  id: number;
  title: string;
  tvdbId: number;
  monitored: boolean;
  statistics: {
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    percentOfEpisodes: number;
  };
}

export interface SonarrQueueRecord {
  id: number;
  seriesId: number;
  title: string;
  status: string;
  sizeleft: number;
  size: number;
  episode?: {
    title: string;
    seasonNumber: number;
    episodeNumber: number;
  };
}

export interface SonarrQueueResponse {
  totalRecords: number;
  records: SonarrQueueRecord[];
}

/** System status response shared by Radarr and Sonarr. */
export interface ArrSystemStatus {
  version: string;
  appName: string;
}

/** Unified download queue item for the frontend. */
export interface DownloadQueueItem {
  id: string;
  title: string;
  mediaType: "movie" | "episode";
  /** Episode label, e.g. "S01E05" */
  episodeLabel?: string;
  /** Download progress 0–100. */
  progress: number;
  /** Human-readable ETA, e.g. "12m", "2h 30m". */
  eta?: string;
  /** Source service. */
  source: "radarr" | "sonarr";
}
