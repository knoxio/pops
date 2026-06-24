/**
 * HTTP-shaped domain errors used by finance-api REST handlers.
 *
 * Each error carries an optional `messageKey` the frontend uses to resolve a
 * translated string, with the EN-AU fallback in `message`. The REST error
 * mapping plumbs `messageKey` through the wire error shape so clients receive
 * it as `data.messageKey`.
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
 * 412 Precondition Failed — the targeted import session exists but is not in a
 * state the requested operation can act on (still processing, no result, or
 * the wrong result type).
 */
export class PreconditionError extends HttpError {
  constructor(message: string, messageKey?: string) {
    super(412, message, undefined, messageKey);
    this.name = 'PreconditionError';
  }
}
