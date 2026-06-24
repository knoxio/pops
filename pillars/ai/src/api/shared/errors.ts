/**
 * HTTP-shaped domain errors thrown by the REST handlers and translated into
 * the wire envelope by `mapHttpError` in `../rest/error-mapping.ts`.
 *
 * This pillar stands alone of every other pillar in the dependency graph, so
 * these errors are defined locally rather than shared.
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

/**
 * Caller is unauthenticated or carries a principal the route refuses.
 * Surfaces as a single 401 on the REST surface.
 */
export class UnauthorizedError extends HttpError {
  constructor(message: string) {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}
