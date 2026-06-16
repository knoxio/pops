/**
 * Lightweight helpers for the generated Hey API lists SDK.
 *
 * Lives outside `src/lists-api/` because the codegen wipes that directory
 * on every regeneration. Anything we hand-author here is safe.
 */

interface SdkErrorBody {
  message?: unknown;
  code?: unknown;
}

/**
 * Unwrap a Hey API `{ data, error }` result into its data payload, or
 * throw if the response was an error. Surfaces `error.message` when the
 * server sent one so toast/error UI gets a useful string.
 */
export function unwrap<T>(result: { data?: T; error?: unknown }): T {
  if (result.error !== undefined) {
    const body = result.error as SdkErrorBody;
    const message =
      typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : 'lists API request failed';
    throw new Error(message);
  }
  if (result.data === undefined) {
    throw new Error('lists API returned no data');
  }
  return result.data;
}
