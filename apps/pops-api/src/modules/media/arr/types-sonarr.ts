/**
 * Sonarr API response and request types.
 */

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

export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
  statistics?: {
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    percentOfEpisodes: number;
  };
}

/** Full series object returned by Sonarr (includes seasons array for PUT updates). */
export interface SonarrSeriesFull extends SonarrSeries {
  seasons: SonarrSeason[];
}

/** Individual episode from Sonarr /episode endpoint. */
export interface SonarrEpisode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  monitored: boolean;
  hasFile: boolean;
}

/** Input for batch episode monitoring updates via PUT /api/v3/episode/monitor. */
export interface SonarrEpisodeMonitorInput {
  episodeIds: number[];
  monitored: boolean;
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

export interface SonarrQualityProfile {
  id: number;
  name: string;
}

export interface SonarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export interface SonarrLanguageProfile {
  id: number;
  name: string;
}

export interface SonarrAddSeriesInput {
  tvdbId: number;
  title: string;
  qualityProfileId: number;
  rootFolderPath: string;
  languageProfileId: number;
  seasons: Array<{ seasonNumber: number; monitored: boolean }>;
}

export interface SonarrCommandResponse {
  id: number;
  name: string;
  status: string;
}

/** Episode from Sonarr /calendar endpoint. */
export interface SonarrCalendarEpisode {
  id: number;
  seriesId: number;
  tvdbId: number;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  airDateUtc: string;
  hasFile: boolean;
  series: {
    id: number;
    title: string;
    tvdbId: number;
    images: Array<{
      coverType: string;
      remoteUrl?: string;
      url?: string;
    }>;
  };
}

/** Calendar episode for the frontend. */
export interface CalendarEpisode {
  id: number;
  seriesId: number;
  seriesTitle: string;
  tvdbId: number;
  episodeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  airDateUtc: string;
  hasFile: boolean;
  posterUrl: string | null;
}
