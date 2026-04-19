export interface SeasonRow {
  id: number;
  seasonNumber: number;
  name: string | null;
  episodeCount: number | null;
}

export interface ProgressData {
  overall: { watched: number; total: number; percentage: number };
  seasons?: { seasonNumber: number; watched: number; total: number; percentage: number }[];
  nextEpisode: {
    seasonNumber: number;
    episodeNumber: number;
    episodeName: string | null;
  } | null;
}

export interface SonarrSeriesData {
  exists: boolean;
  sonarrId?: number | null;
  seasons?: { seasonNumber: number; monitored: boolean }[];
}
