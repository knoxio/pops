/**
 * Cross-pillar URI dispatcher (ADR-026 pre-flight P2).
 *
 * Sits on top of the in-process `resolveUri()` (PRD-101 US-08) and adds the
 * remote leg required by ADR-026: if the owning pillar is registered with a
 * non-local base URL, HTTP-proxy the call to `${baseUrl}/uri/resolve` and
 * return whatever it produces. If the remote pillar can't be reached, return
 * `pillar-unavailable` so the caller renders a placeholder rather than
 * surfacing a network error.
 *
 * Today, with no `POPS_PILLARS` set, every dispatch falls through to the
 * in-process resolver — the existing tRPC `core.uri.resolve` behaviour is
 * preserved exactly. As pillars split off, deployers add entries to
 * `POPS_PILLARS` and the dispatcher routes accordingly.
 */

import { parseUri } from '../uri/parse.js';
import { resolveUri, type ResolveUriOptions } from '../uri/resolver.js';
import { getPillarEntry } from './registry.js';

import type { PillarRegistryEntry, UriResolverResult } from '@pops/types';

/**
 * Function shape for the HTTP leg, factored out so tests can inject a fake
 * without monkeypatching `fetch`. Returns a `UriResolverResult` parsed from
 * the remote pillar's response, or throws on transport/parse failure (caught
 * by the dispatcher and translated to `pillar-unavailable`).
 */
export type RemoteResolve = (
  entry: PillarRegistryEntry,
  uri: string,
  signal: AbortSignal
) => Promise<UriResolverResult>;

export interface DispatchUriOptions extends ResolveUriOptions {
  /** Override the remote-leg implementation (tests only). */
  readonly remoteResolve?: RemoteResolve;
  /** Timeout for the remote call in milliseconds. Default 5_000. */
  readonly remoteTimeoutMs?: number;
}

const DEFAULT_REMOTE_TIMEOUT_MS = 5_000;

/**
 * Resolve a `pops:{pillar}/{type}/{id}` URI, routing across the pillar
 * registry when the owning pillar lives in a separate process.
 *
 * Order of checks:
 *   1. Parse the URI — malformed input returns `malformed` without touching
 *      the registry. (Mirrors `resolveUri`.)
 *   2. Look up the owning pillar in `POPS_PILLARS`. Hit ⇒ remote leg.
 *      Miss ⇒ fall through to in-process `resolveUri`.
 *   3. Remote leg: POST to `${baseUrl}/uri/resolve` with `{uri}`. Bound by
 *      `remoteTimeoutMs`. Any throw (network error, abort, non-2xx, malformed
 *      JSON) becomes `pillar-unavailable` so the caller treats it as a
 *      transient placeholder.
 */
export async function dispatchUri(
  uri: string,
  options: DispatchUriOptions
): Promise<UriResolverResult> {
  // 1. Parse first so a malformed URI never triggers a remote call.
  const parsed = parseUri(uri);
  if (!parsed.ok) {
    return { kind: 'malformed', uri, reason: parsed.reason };
  }

  // 2. Look up the owning pillar.
  const entry = getPillarEntry(parsed.parsed.moduleId);
  if (!entry) {
    // No remote pillar registered — fall back to the existing in-process path.
    return resolveUri(uri, options);
  }

  // 3. Remote leg.
  const remote = options.remoteResolve ?? defaultRemoteResolve;
  const controller = new AbortController();
  const timeoutMs = options.remoteTimeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await remote(entry, uri, controller.signal);
  } catch (err) {
    return {
      kind: 'pillar-unavailable',
      moduleId: parsed.parsed.moduleId,
      reason: describeRemoteError(err, timeoutMs, controller.signal.aborted),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Production remote-leg: POST to `${baseUrl}/uri/resolve` via `fetch`. */
const defaultRemoteResolve: RemoteResolve = async (entry, uri, signal) => {
  const response = await fetch(`${entry.baseUrl}/uri/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uri }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const json = (await response.json()) as UriResolverResult;
  if (
    typeof json !== 'object' ||
    json === null ||
    typeof (json as { kind?: unknown }).kind !== 'string'
  ) {
    throw new Error('response missing discriminator field');
  }
  return json;
};

function describeRemoteError(err: unknown, timeoutMs: number, aborted: boolean): string {
  if (aborted) return `timed out after ${timeoutMs}ms`;
  if (err instanceof Error) return err.message;
  return 'unknown error';
}
