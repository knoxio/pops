export interface SyncResult {
  synced: number;
  skipped: number;
  errors: { title: string; reason: string; year: number | null }[];
  skipReasons?: { title: string; reason: string; year: number | null }[];
}

export interface WatchlistSyncResult {
  added: number;
  removed: number;
  skipped: number;
  errors: { title: string; reason: string }[];
  skipReasons?: { title: string; reason: string }[];
}

export interface EpisodeMismatch {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}

export interface ShowWatchDiagnostics {
  title: string;
  tvdbId: number;
  plexViewedLeafCount: number | null;
  diagnostics: {
    plexTotal: number;
    plexWatched: number;
    matched: number;
    alreadyLogged: number;
    seasonNotFound: number;
    episodeNotFound: number;
    missingSeasonsPreview: number[];
    missingEpisodesPreview: EpisodeMismatch[];
  };
}

export interface WatchHistorySyncResult {
  movies: {
    total: number;
    watched: number;
    logged: number;
    alreadyLogged: number;
    noLocalMatch: number;
  } | null;
  shows: ShowWatchDiagnostics[];
  summary: {
    moviesLogged: number;
    episodesLogged: number;
    episodesAlreadyLogged: number;
    showsProcessed: number;
    showsWithGaps: number;
  };
}

export interface DiscoverMediaResult {
  total: number;
  watched: number;
  logged: number;
  alreadyLogged: number;
  added: number;
  notFound: number;
  errors: number;
  errorSamples?: string[];
}

export interface DiscoverWatchSyncResult {
  movies: DiscoverMediaResult;
  tvShows: DiscoverMediaResult;
}
