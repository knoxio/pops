/** Per-movie reference stored in the rotation log details. */
export interface RotationMovieRef {
  tmdbId: number;
  title: string;
}

/** Per-movie reference for failed removals, which may carry an error message. */
export interface RotationFailedMovieRef extends RotationMovieRef {
  error?: string;
}

export interface RotationCycleResult {
  moviesMarkedLeaving: number;
  moviesRemoved: number;
  moviesAdded: number;
  removalsFailed: number;
  freeSpaceGb: number;
  targetFreeGb: number;
  skippedReason: string | null;
  /** Per-movie detail lists written to the rotation_log details column. */
  marked: RotationMovieRef[];
  removed: RotationMovieRef[];
  added: RotationMovieRef[];
  failed: RotationFailedMovieRef[];
}

export function emptyResult(targetFreeGb: number): RotationCycleResult {
  return {
    moviesMarkedLeaving: 0,
    moviesRemoved: 0,
    moviesAdded: 0,
    removalsFailed: 0,
    freeSpaceGb: 0,
    targetFreeGb,
    skippedReason: null,
    marked: [],
    removed: [],
    added: [],
    failed: [],
  };
}
