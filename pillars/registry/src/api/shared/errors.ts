/**
 * HTTP-shaped domain errors used by the registry pillar's route handlers.
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
 * Caller is unauthenticated or carries a principal the route refuses
 * (e.g. a service-account principal hitting a `userOnly` admin route, or
 * a service account whose granted scopes don't cover the requested path).
 * Both "you aren't authenticated" and "you can't call this" collapse to a
 * single 401 on the REST surface.
 */
export class UnauthorizedError extends HttpError {
  constructor(message: string) {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}
