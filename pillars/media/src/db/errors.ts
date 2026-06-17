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
