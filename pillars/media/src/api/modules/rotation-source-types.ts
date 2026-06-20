/**
 * Rotation source adapter plugin interface.
 *
 * Defines the pluggable contract for fetching candidate movies from external
 * sources (TMDB top-rated, Plex watchlist, Plex friends, Letterboxd). Adapters
 * are pure fetch+map units: db persistence lives in the source-sync
 * orchestration, not in the adapter.
 */
import type { FetchedCandidate } from '../../db/index.js';

/** A candidate movie fetched from an external source. */
export type CandidateMovie = FetchedCandidate;

/** Plugin interface for a rotation source adapter. */
export interface RotationSourceAdapter {
  /** Unique source type identifier (matches `rotation_sources.type`). */
  readonly type: string;

  /**
   * Fetch candidate movies from this source.
   *
   * @param config - JSON-parsed config from `rotation_sources.config`
   * @param deps - resolved collaborators an adapter may need (Plex token, …)
   */
  fetchCandidates(
    config: Record<string, unknown>,
    deps: RotationSourceDeps
  ): Promise<CandidateMovie[]>;
}

/**
 * Collaborators an adapter may pull in. Resolved per-sync by the orchestration
 * layer so adapters stay db-handle-free and testable. `plexToken` / `plexClientId`
 * are `null` when Plex is unconfigured.
 */
export interface RotationSourceDeps {
  plexToken: string | null;
  plexClientId: string | null;
}
