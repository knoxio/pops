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

/**
 * Caller is unauthenticated or carries a principal the route refuses
 * (e.g. a service-account principal hitting a `userOnly` admin route, or
 * a service account whose granted scopes don't cover the requested path).
 * Mirrors the `UNAUTHORIZED` / `FORBIDDEN` tRPC procedure gates as a single
 * 401 on the REST surface — the legacy tRPC layer already collapses both to
 * "you can't call this" at the wire level for these domains.
 */
export class UnauthorizedError extends HttpError {
  constructor(message: string) {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}
