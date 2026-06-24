/**
 * Helpers for the generated Hey API food SDK.
 *
 * Lives outside `src/food-api/` because codegen wipes that directory on
 * every regeneration. Anything hand-authored here is safe.
 *
 * `unwrap` turns a Hey API `{ data, error, response }` result into its
 * data payload, throwing `FoodApiError` (carrying the HTTP status) on
 * failure. The status lets call sites distinguish UX states:
 *   - 404            → "not found"    (isNotFoundError)
 *   - 503            → "unavailable"  (isUnavailableError — e.g. ingest queue down)
 *   - 5xx / no status → "unavailable" (isUnavailableError)
 */

interface SdkErrorBody {
  message?: unknown;
}

export class FoodApiError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status: number | undefined) {
    super(message);
    this.name = 'FoodApiError';
    this.status = status;
  }
}

export function unwrap<T>(result: { data?: T; error?: unknown; response?: Response }): T {
  if (result.error !== undefined) {
    const body = result.error as SdkErrorBody;
    const message =
      typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : 'food API request failed';
    throw new FoodApiError(message, result.response?.status);
  }
  if (result.data === undefined) {
    throw new FoodApiError('food API returned no data', result.response?.status);
  }
  return result.data;
}

/** True when the failure was a 404 (entity missing). */
export function isNotFoundError(err: unknown): boolean {
  return err instanceof FoodApiError && err.status === 404;
}

/** True when the pillar was unreachable or errored server-side (no status / 5xx),
 *  or the ingest queue was unavailable (503). */
export function isUnavailableError(err: unknown): boolean {
  return (
    err instanceof FoodApiError &&
    (err.status === undefined || err.status === 503 || err.status >= 500)
  );
}
