const NETWORK_ERROR_FRAGMENTS = [
  'Failed to fetch',
  'NetworkError',
  'Network request failed',
  'aborted',
  'timeout',
];

function messageLooksLikeNetworkFailure(err: object): boolean {
  if (!('message' in err) || typeof err.message !== 'string') return false;
  return NETWORK_ERROR_FRAGMENTS.some((fragment) => (err.message as string).includes(fragment));
}

/**
 * Heuristic: is this error a network/transport-level failure (server
 * unreachable, request aborted, fetch threw) rather than an error the
 * server returned with a real status code?
 *
 * Server-returned errors carry a `data` field with status detail. Network
 * failures don't make it that far — they bubble up wrapping a fetch error,
 * an AbortError, or a `DOMException` (which is not an `Error` subclass in
 * browsers).
 */
export function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if ('data' in err && err.data != null) return false;
  if (messageLooksLikeNetworkFailure(err)) return true;
  // `DOMException` (Web abort errors) is not an `Error` subclass, so the
  // recursion needs to follow any throwable-shaped cause, not just `Error`.
  const cause = 'cause' in err ? err.cause : undefined;
  if (cause && typeof cause === 'object') return isNetworkError(cause);
  return false;
}
