/**
 * Typed errors raised by the media domain service layer.
 *
 * Plain Error subclasses — the service layer doesn't know about HTTP.
 * The pops-api router/middleware maps them to status codes when surfacing
 * to clients. Mirrors `@pops/finance-db`'s error pattern.
 */

export class MovieNotFoundError extends Error {
  override readonly name = 'MovieNotFoundError' as const;
  readonly id: number;

  constructor(id: number) {
    super(`Movie '${id}' not found`);
    this.id = id;
  }
}

export class MovieConflictError extends Error {
  override readonly name = 'MovieConflictError' as const;
  readonly tmdbId: number;

  constructor(tmdbId: number) {
    super(`Movie with tmdbId ${tmdbId} already exists`);
    this.tmdbId = tmdbId;
  }
}

export class TvShowNotFoundError extends Error {
  override readonly name = 'TvShowNotFoundError' as const;
  readonly id: number;

  constructor(id: number) {
    super(`TvShow '${id}' not found`);
    this.id = id;
  }
}

export class TvShowConflictError extends Error {
  override readonly name = 'TvShowConflictError' as const;
  readonly tvdbId: number;

  constructor(tvdbId: number) {
    super(`TvShow with tvdbId ${tvdbId} already exists`);
    this.tvdbId = tvdbId;
  }
}

export class SeasonNotFoundError extends Error {
  override readonly name = 'SeasonNotFoundError' as const;
  readonly id: number;

  constructor(id: number) {
    super(`Season '${id}' not found`);
    this.id = id;
  }
}

export class SeasonConflictError extends Error {
  override readonly name = 'SeasonConflictError' as const;

  constructor(message: string) {
    super(message);
  }
}

export class EpisodeNotFoundError extends Error {
  override readonly name = 'EpisodeNotFoundError' as const;
  readonly id: number;

  constructor(id: number) {
    super(`Episode '${id}' not found`);
    this.id = id;
  }
}

export class EpisodeConflictError extends Error {
  override readonly name = 'EpisodeConflictError' as const;

  constructor(message: string) {
    super(message);
  }
}

export class WatchHistoryNotFoundError extends Error {
  override readonly name = 'WatchHistoryNotFoundError' as const;
  readonly id: number;

  constructor(id: number) {
    super(`Watch history entry '${id}' not found`);
    this.id = id;
  }
}

export class WatchHistoryConflictError extends Error {
  override readonly name = 'WatchHistoryConflictError' as const;
  readonly mediaType: 'movie' | 'episode';
  readonly mediaId: number;
  readonly watchedAt: string;

  constructor(mediaType: 'movie' | 'episode', mediaId: number, watchedAt: string) {
    super(`Watch history entry for ${mediaType} ${mediaId} at ${watchedAt} already exists`);
    this.mediaType = mediaType;
    this.mediaId = mediaId;
    this.watchedAt = watchedAt;
  }
}

export class RotationCandidateNotFoundError extends Error {
  override readonly name = 'RotationCandidateNotFoundError' as const;
  readonly id: number;

  constructor(id: number) {
    super(`Rotation candidate '${id}' not found`);
    this.id = id;
  }
}

export class RotationCandidateNotPendingError extends Error {
  override readonly name = 'RotationCandidateNotPendingError' as const;
  readonly id: number;
  readonly status: string;

  constructor(id: number, status: string) {
    super(`Rotation candidate '${id}' is already processed (status: ${status})`);
    this.id = id;
    this.status = status;
  }
}

export class RotationSourceNotFoundError extends Error {
  override readonly name = 'RotationSourceNotFoundError' as const;
  readonly id: number;

  constructor(id: number) {
    super(`Rotation source '${id}' not found`);
    this.id = id;
  }
}

export class RotationSourceDisabledError extends Error {
  override readonly name = 'RotationSourceDisabledError' as const;
  readonly id: number;

  constructor(id: number, name: string) {
    super(`Rotation source '${id}' (${name}) is disabled`);
    this.id = id;
  }
}

export class RotationManualSourceProtectedError extends Error {
  override readonly name = 'RotationManualSourceProtectedError' as const;

  constructor() {
    super('The manual rotation source cannot be deleted');
  }
}

export class RotationMovieExcludedError extends Error {
  override readonly name = 'RotationMovieExcludedError' as const;
  readonly tmdbId: number;

  constructor(tmdbId: number) {
    super(`Movie with tmdbId ${tmdbId} is excluded from rotation`);
    this.tmdbId = tmdbId;
  }
}
