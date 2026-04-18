// ---------------------------------------------------------------------------
// pops:sync queue
// ---------------------------------------------------------------------------

export interface PlexSyncMoviesJobData {
  type: 'plexSyncMovies';
  sectionId: string;
}

export interface PlexSyncTvShowsJobData {
  type: 'plexSyncTvShows';
  sectionId: string;
}

export interface PlexSyncWatchlistJobData {
  type: 'plexSyncWatchlist';
}

export interface PlexSyncWatchHistoryJobData {
  type: 'plexSyncWatchHistory';
  movieSectionId?: string;
  tvSectionId?: string;
}

export interface PlexSyncDiscoverWatchesJobData {
  type: 'plexSyncDiscoverWatches';
}

export interface PlexScheduledSyncJobData {
  type: 'plexScheduledSync';
  movieSectionId?: string;
  tvSectionId?: string;
}

export type SyncQueueJobData =
  | PlexSyncMoviesJobData
  | PlexSyncTvShowsJobData
  | PlexSyncWatchlistJobData
  | PlexSyncWatchHistoryJobData
  | PlexSyncDiscoverWatchesJobData
  | PlexScheduledSyncJobData;

// ---------------------------------------------------------------------------
// pops:embeddings / pops:curation / pops:default queues (stubs)
// ---------------------------------------------------------------------------

export interface GenericJobData {
  type: string;
  [key: string]: unknown;
}

export type EmbeddingsQueueJobData = GenericJobData;
export type CurationQueueJobData = GenericJobData;
export type DefaultQueueJobData = GenericJobData;

// ---------------------------------------------------------------------------
// pops:dead-letter queue
// ---------------------------------------------------------------------------

export interface DeadLetterJobData {
  originalQueue: string;
  originalJobId: string | undefined;
  originalJobName: string;
  originalData: unknown;
  failedAt: string;
  attemptsMade: number;
  finalError: string;
  finalErrorStack?: string;
}
