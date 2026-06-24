/**
 * Helpers for the generated Hey API inventory SDK.
 *
 * Lives outside `src/inventory-api/` because codegen wipes that
 * directory on every regeneration. Anything hand-authored here is safe.
 *
 * `unwrap` turns a Hey API `{ data, error, response }` result into its
 * data payload, throwing `InventoryApiError` (carrying the HTTP status)
 * on failure. The status lets call sites distinguish:
 *   - 404            → "not found"   (isNotFoundError)
 *   - 5xx / no status → "unavailable" (isUnavailableError)
 */

interface SdkErrorBody {
  message?: unknown;
}

export class InventoryApiError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status: number | undefined) {
    super(message);
    this.name = 'InventoryApiError';
    this.status = status;
  }
}

export function unwrap<T>(result: { data?: T; error?: unknown; response?: Response }): T {
  if (result.error !== undefined) {
    const body = result.error as SdkErrorBody;
    const message =
      typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : 'inventory API request failed';
    throw new InventoryApiError(message, result.response?.status);
  }
  if (result.data === undefined) {
    throw new InventoryApiError('inventory API returned no data', result.response?.status);
  }
  return result.data;
}

/** True when the failure was a 404 (entity missing). */
export function isNotFoundError(err: unknown): boolean {
  return err instanceof InventoryApiError && err.status === 404;
}

/** True when the pillar was unreachable or errored server-side (no status / 5xx). */
export function isUnavailableError(err: unknown): boolean {
  return err instanceof InventoryApiError && (err.status === undefined || err.status >= 500);
}
