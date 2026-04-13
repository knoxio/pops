/**
 * Rotation source plugin interface and types.
 *
 * PRD-071 US-02: defines the pluggable adapter pattern for fetching
 * candidate movies from different sources (Plex watchlist, IMDB lists, etc.)
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** A candidate movie fetched from an external source. */
export interface CandidateMovie {
  tmdbId: number;
  title: string;
  year: number | null;
  rating: number | null;
  posterPath: string | null;
}

/** Plugin interface for a rotation source adapter. */
export interface RotationSourceAdapter {
  /** Unique source type identifier (matches rotation_sources.type). */
  readonly type: string;

  /**
   * Fetch candidate movies from this source.
   * @param config - JSON-parsed config from rotation_sources.config
   */
  fetchCandidates(config: Record<string, unknown>): Promise<CandidateMovie[]>;
}
