/**
 * Map media service errors to ts-rest response envelopes.
 *
 * Handlers translate the pillar's db-layer domain errors into `HttpError`
 * subclasses carrying a real `statusCode` (`NotFoundError` → 404,
 * `ConflictError` → 409, `ValidationError` → 400, `BadGatewayError` → 502
 * for upstream provider failures). For those mapped statuses we return a
 * typed `{ status, body }` envelope; anything else (an unmapped 500-class
 * `HttpError`, or a non-HttpError) is re-thrown so Express's error pipeline
 * surfaces the real stack rather than a swallowed 500.
 *
 * `messageKey` is carried through so the FE can drive i18n off it.
 */
import { HttpError } from '../shared/errors.js';

export interface ErrorBody {
  message: string;
  code?: string;
  messageKey?: string;
}

export type ErrorStatus = 400 | 404 | 409 | 502;

export interface MappedHttpError {
  status: ErrorStatus;
  body: ErrorBody;
}

function isMappedStatus(status: number): status is ErrorStatus {
  return status === 400 || status === 404 || status === 409 || status === 502;
}

export function mapHttpError(err: unknown): MappedHttpError | null {
  if (err instanceof HttpError && isMappedStatus(err.statusCode)) {
    return {
      status: err.statusCode,
      body: { message: err.message, code: err.name, messageKey: err.messageKey },
    };
  }
  return null;
}

/**
 * Run a handler body and convert any mapped `HttpError` into its response
 * envelope. Accepts sync or async bodies. Unmapped throws propagate to
 * Express.
 */
export async function runHttp<T extends { status: number; body: unknown }>(
  fn: () => T | Promise<T>
): Promise<T | MappedHttpError> {
  try {
    return await fn();
  } catch (err) {
    const mapped = mapHttpError(err);
    if (mapped !== null) return mapped;
    throw err as Error;
  }
}
