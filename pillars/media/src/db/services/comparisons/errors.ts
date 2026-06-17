/**
 * Typed errors raised by the comparisons service layer.
 *
 * Plain Error subclasses — the service layer is HTTP-free. The REST handler
 * boundary maps them to status codes (NotFound → 404, Conflict → 409,
 * Invalid* → 400) via `comparisons-handlers.ts`.
 */

export class ComparisonNotFoundError extends Error {
  override readonly name = 'ComparisonNotFoundError' as const;
  readonly id: number;

  constructor(id: number) {
    super(`Comparison '${id}' not found`);
    this.id = id;
  }
}

export class DimensionNotFoundError extends Error {
  override readonly name = 'DimensionNotFoundError' as const;
  readonly id: number;

  constructor(id: number) {
    super(`Dimension '${id}' not found`);
    this.id = id;
  }
}

export class DimensionConflictError extends Error {
  override readonly name = 'DimensionConflictError' as const;

  constructor(name: string) {
    super(`Dimension '${name}' already exists`);
  }
}

export class MediaScoreNotFoundError extends Error {
  override readonly name = 'MediaScoreNotFoundError' as const;

  constructor(mediaType: string, mediaId: number, dimensionId: number) {
    super(`MediaScore '${mediaType}:${mediaId}:${dimensionId}' not found`);
  }
}

export class InactiveDimensionError extends Error {
  override readonly name = 'InactiveDimensionError' as const;

  constructor(message: string) {
    super(message);
  }
}

export class InvalidWinnerError extends Error {
  override readonly name = 'InvalidWinnerError' as const;

  constructor(message: string) {
    super(message);
  }
}
