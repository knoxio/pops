/**
 * HTTP-shaped domain errors used by the media REST handlers.
 *
 * Each error carries an optional `messageKey` so the frontend can resolve a
 * translated string while the EN-AU fallback lives in `message`; the REST
 * error mapping plumbs it through the wire error shape as `data.messageKey`.
 */
export class HttpError extends Error {
  /** i18n key the frontend uses to resolve a localised message. */
  public readonly messageKey?: string;

  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
    messageKey?: string
  ) {
    super(message);
    this.name = 'HttpError';
    this.messageKey = messageKey;
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string, id: string) {
    super(404, `${resource} '${id}' not found`, undefined, 'common.notFound');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends HttpError {
  constructor(details: unknown) {
    super(400, 'Validation failed', details, 'common.validationFailed');
    this.name = 'ValidationError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message, undefined, 'common.conflict');
    this.name = 'ConflictError';
  }
}

/**
 * An upstream metadata provider (TMDB / TheTVDB) failed. Maps to 502 so the
 * FE can tell a dependency outage apart from a 4xx caller error.
 */
export class BadGatewayError extends HttpError {
  constructor(message: string) {
    super(502, message, undefined, 'common.upstreamError');
    this.name = 'BadGatewayError';
  }
}
