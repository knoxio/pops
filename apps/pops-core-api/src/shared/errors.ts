/**
 * HTTP-shaped domain errors used by core-api router handlers.
 *
 * Intentionally NOT imported from `apps/pops-api/src/shared/errors.ts` —
 * the per-pillar container is supposed to stand alone of pops-api in the
 * dependency graph (Phase 5 writer-move pattern). The subset reproduced
 * here is whatever the migrated routers need; future PRs can grow the
 * set as more slices move across.
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string, id: string) {
    super(404, `${resource} '${id}' not found`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends HttpError {
  constructor(details: unknown) {
    super(400, 'Validation failed', details);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictError';
  }
}
