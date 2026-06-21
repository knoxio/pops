/**
 * Helpers for app-food's generated lists Hey API SDK.
 *
 * Lives outside `src/lists-api/` because codegen wipes that directory on
 * every regeneration. `unwrap` turns a Hey API `{ data, error }` result
 * into its data payload, throwing with the server message on failure.
 */
interface SdkErrorBody {
  message?: unknown;
}

export function unwrapLists<T>(result: { data?: T; error?: unknown }): T {
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
