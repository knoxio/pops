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
export * from './schema.js';

export type { MediaDb } from './services/internal.js';

export { openMediaDb, type OpenedMediaDb } from './open-media-db.js';

export { TvShowConflictError, TvShowNotFoundError } from './errors.js';

export type {
  CreateTvShowInput,
  TvShow,
  TvShowFilters,
  TvShowListResult,
  TvShowRow,
  UpdateTvShowInput,
} from './services/tv-shows.js';

export * as tvShowsService from './services/tv-shows.js';

export * as shelfImpressionsService from './services/shelf-impressions.js';
