/**
 * Backend-safe barrel for the media domain's persistence layer.
 *
 * Hosts the media pillar's tables (rotation, comparisons, watchlist, watch
 * history, movies, tv shows, discovery, debrief, shelf impressions, …)
 * extracted from `apps/pops-api/src/modules/media/` per ADR-026 / Track F
 * of `.claude/pillar-migration-roadmap.md`.
 *
 * Per the CI-never-breaks pattern the migration is incremental — this PR
 * scaffolds the package and moves only the `shelf-impressions` slice. The
 * remaining slices (watchlist, watch history, comparisons, rotation,
 * discovery, debrief, movies, tv shows, …) follow in subsequent PRs.
 */
export * from './row-types.js';
export * from './schema.js';

export type { MediaDb } from './services/internal.js';

export { openMediaDb, type OpenedMediaDb } from './open-media-db.js';

export {
  EpisodeConflictError,
  EpisodeNotFoundError,
  MovieConflictError,
  MovieNotFoundError,
  RotationCandidateNotFoundError,
  RotationCandidateNotPendingError,
  RotationManualSourceProtectedError,
  RotationMovieExcludedError,
  RotationSourceDisabledError,
  RotationSourceNotFoundError,
  SeasonConflictError,
  SeasonNotFoundError,
  TvShowConflictError,
  TvShowNotFoundError,
  WatchHistoryConflictError,
  WatchHistoryNotFoundError,
} from './errors.js';

export type {
  CreateMovieInput,
  Movie,
  MovieFilters,
  MovieListResult,
  MovieRow,
  RotationStatus,
  UpdateMovieInput,
} from './services/movies.js';

export * as moviesService from './services/movies.js';

export * as shelfImpressionsService from './services/shelf-impressions.js';

export * as plexSettingsService from './services/plex-settings.js';

export type {
  AddToQueueInput,
  CandidateListRow,
  CandidateStatus,
  CandidateStatusResult,
  ListCandidatesInput,
  ListCandidatesResult,
  RotationCandidateRow,
} from './services/rotation/candidates.js';

export * as rotationCandidatesService from './services/rotation/candidates.js';

export type { FetchedCandidate } from './services/rotation/candidate-sync.js';

export * as rotationCandidateSyncService from './services/rotation/candidate-sync.js';

export type { AddExclusionInput, RotationExclusionRow } from './services/rotation/exclusions.js';

export * as rotationExclusionsService from './services/rotation/exclusions.js';

export type {
  CreateSourceInput,
  RotationSourceRow,
  SourceWithCount,
  UpdateSourceInput,
} from './services/rotation/sources.js';

export * as rotationSourcesService from './services/rotation/sources.js';

export * as rotationSettingsService from './services/rotation/settings.js';

export type {
  ListRotationLogResult,
  RotationCycleLog,
  RotationFailedMovieRef,
  RotationLogRow,
  RotationLogStats,
  RotationMovieRef,
} from './services/rotation/rotation-log.js';

export * as rotationLogService from './services/rotation/rotation-log.js';

export type { SelectedCandidate } from './services/rotation/selection-policy.js';

export * as rotationSelectionService from './services/rotation/selection-policy.js';

export type {
  EligibleMovie,
  ExpiredMovie,
  LeavingMovie,
  MovieSizeMap,
} from './services/rotation/removal-queries.js';

export * as rotationRemovalQueries from './services/rotation/removal-queries.js';

export type { DismissedDiscoverRow } from './services/dismissed-discover.js';

export * as dismissedDiscoverService from './services/dismissed-discover.js';

export type {
  LibraryListInput,
  LibraryListResult,
  LibraryRawRow,
  LibrarySortOption,
  LibraryType,
} from './services/library.js';

export * as libraryService from './services/library.js';

export type {
  CreateTvShowInput,
  TvShow,
  TvShowFilters,
  TvShowListResult,
  TvShowRow,
  UpdateTvShowInput,
} from './services/tv-shows.js';

export * as tvShowsService from './services/tv-shows.js';

export type {
  CreateSeasonInput,
  SeasonListResult,
  UpsertSeasonInput,
  UpsertSeasonResult,
} from './services/seasons.js';

export * as seasonsService from './services/seasons.js';

export type {
  CreateEpisodeInput,
  EpisodeListResult,
  UpsertEpisodeInput,
} from './services/episodes.js';

export * as episodesService from './services/episodes.js';

export type {
  AddWatchHistoryInput,
  UpdateWatchHistoryInput,
  WatchHistoryEntry,
  WatchHistoryFilters,
  WatchHistoryListResult,
  WatchHistoryMediaType,
  WatchHistoryRow,
} from './services/watch-history.js';

export * as watchHistoryService from './services/watch-history.js';

export type {
  BatchProgressEntry,
  NextEpisode,
  SeasonProgress,
  TvShowProgress,
} from './services/watch-history-progress.js';

export * as watchHistoryProgressService from './services/watch-history-progress.js';

export type {
  RecentWatchHistoryEntry,
  RecentWatchHistoryFilters,
  RecentWatchHistoryListResult,
} from './services/watch-history-recent.js';

export * as watchHistoryRecentService from './services/watch-history-recent.js';

export type { LogWatchInput, LogWatchResult } from './services/watch-history-log.js';

export * as watchHistoryLogService from './services/watch-history-log.js';

export type { BatchLogResult, BatchLogWatchInput } from './services/watch-history-batch.js';

export * as watchHistoryBatchService from './services/watch-history-batch.js';

export type {
  InsertSyncJobInput,
  SyncJob,
  SyncJobProgress,
  SyncJobResultRow,
  SyncJobStatus,
  UpdateSyncJobInput,
} from './services/sync-job-results.js';

export * as syncJobResultsService from './services/sync-job-results.js';

export type { SyncLogEntry, WriteSyncLogInput } from './services/sync-logs.js';

export * as syncLogsService from './services/sync-logs.js';

export * as watchlistService from './services/watchlist.js';

export {
  WatchlistEntryNotFoundError,
  WatchlistReorderConflictError,
  type AddToWatchlistInput,
  type MediaWatchlistRow,
  type UpdateWatchlistInput,
  type WatchlistFilters,
  type WatchlistListResult,
} from './services/watchlist.js';

export {
  ComparisonNotFoundError,
  DimensionConflictError,
  DimensionNotFoundError,
  InactiveDimensionError,
  InvalidWinnerError,
  MediaScoreNotFoundError,
} from './services/comparisons/index.js';

export type {
  BatchComparisonItem,
  BatchRecordResult,
  BlacklistMovieResult,
  Comparison,
  ComparisonSource,
  CreateDimensionInput,
  Dimension,
  DrawTier,
  MediaScore,
  MediaType as ComparisonMediaType,
  RandomPair,
  RankedMediaEntry,
  RecordComparisonInput,
  SmartPairResult,
  SubmitTierListInput,
  SubmitTierListResult,
  Tier,
  TierListMovie,
  TierPlacement,
  UpdateDimensionInput,
} from './services/comparisons/index.js';

export * as comparisonsService from './services/comparisons/index.js';

/**
 * Reset comparison staleness for a media item (delete the row → fresh, 1.0).
 * Exported standalone so the watch-history log/batchLog paths can call it on
 * a (re)watch — a follow-up wires that up. Mirrors `comparisonsService.resetStaleness`.
 */
export { resetStaleness } from './services/comparisons/staleness.js';
