/**
 * Cross-pillar URI dispatcher (ADR-026).
 *
 * Sits on top of the in-process `resolveUri()` and adds the remote leg: if
 * the owning pillar is registered with a non-local base URL, HTTP-proxy the
 * call to `${baseUrl}/uri/resolve` and return whatever it produces. If the
 * remote pillar can't be reached, return `pillar-unavailable` so the caller
 * renders a placeholder rather than surfacing a network error.
 *
 * The owning-pillar lookup is registry-first: the production wiring routes off
 * the live DB registry and falls back to the `POPS_PILLARS` seed. When neither
 * knows the owning pillar, the dispatch falls through to the in-process
 * resolver.
 */
import { parseUri } from '../modules/uri/parse.js';
import { resolveUri, type ResolveUriOptions } from '../modules/uri/resolver.js';
import { seedPillarEntry } from './registry.js';

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
  /**
   * URI-namespace id this process owns. URIs whose `pops:<id>/…` segment
   * matches are ALWAYS routed to the in-process resolver. Defaults to `'core'`
   * — the registry pillar serves the `pops:core/…` URI namespace, which is
   * intentionally NOT renamed with the pillar's directory/registration id.
   * Prevents self-recursion on a misconfigured `core:http://registry-api:3000`
   * env entry.
   */
  readonly selfPillarId?: string;
  /**
   * Remote-pillar lookup. The production wiring (`handlers.ts`) injects a
   * registry-first resolver (live DB registry, `POPS_PILLARS` seed fallback).
   * When omitted, the dispatcher defaults to the env-seed-only `seedPillarEntry`
   * so a DB-less caller (or a unit test) still routes off `POPS_PILLARS`.
   */
  readonly lookupPillar?: (id: string) => PillarRegistryEntry | undefined;
}

const DEFAULT_REMOTE_TIMEOUT_MS = 5_000;
const DEFAULT_SELF_PILLAR_ID = 'core';

/**
 * Known `UriResolverResult.kind` values. Centralised so the remote-leg parser
 * can reject unknown discriminator values from a misbehaving or
 * mismatched-version pillar.
 */
const KNOWN_KINDS: ReadonlySet<UriResolverResult['kind']> = new Set([
  'object',
  'not-found',
  'module-absent',
  'pillar-unavailable',
  'malformed',
]);

function isKnownKind(kind: string): kind is UriResolverResult['kind'] {
  return (KNOWN_KINDS as ReadonlySet<string>).has(kind);
}

/**
 * Resolve a `pops:{pillar}/{type}/{id}` URI, routing across the pillar
 * registry when the owning pillar lives in a separate process.
 *
 * Order of checks:
 *   1. Parse the URI — malformed input returns `malformed` without touching
 *      the registry.
 *   2. If the URI is owned by `selfPillarId`, ALWAYS resolve in-process.
 *   3. Look up the owning pillar via `lookupPillar` (registry-first; seed
 *      fallback). Hit ⇒ remote leg. Miss ⇒ fall through to in-process
 *      `resolveUri`.
 *   4. Remote leg: POST to `${baseUrl}/uri/resolve` with `{uri}`. Bound by
 *      `remoteTimeoutMs`. Any throw becomes `pillar-unavailable`.
 */
export async function dispatchUri(
  uri: string,
  options: DispatchUriOptions
): Promise<UriResolverResult> {
  const parsed = parseUri(uri);
  if (!parsed.ok) {
    return { kind: 'malformed', uri, reason: parsed.reason };
  }

  const selfPillarId = options.selfPillarId ?? DEFAULT_SELF_PILLAR_ID;
  if (parsed.parsed.moduleId === selfPillarId) {
    return resolveUri(uri, options);
  }

  const lookup = options.lookupPillar ?? seedPillarEntry;
  // A registry-first lookup reads the DB; a DB error must NOT turn /uri/resolve
  // into a 500. Treat any lookup failure as a cache miss and fall through to
  // in-process resolution, preserving the "never throws" dispatch contract.
  let entry: PillarRegistryEntry | undefined;
  try {
    entry = lookup(parsed.parsed.moduleId);
  } catch {
    return resolveUri(uri, options);
  }
  if (!entry) {
    return resolveUri(uri, options);
  }

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
  const json: unknown = await response.json();
  if (typeof json !== 'object' || json === null) {
    throw new Error('response is not a JSON object');
  }
  const kind: unknown = Reflect.get(json, 'kind');
  if (typeof kind !== 'string') {
    throw new Error('response missing discriminator field');
  }
  if (!isKnownKind(kind)) {
    throw new Error(`unknown response kind '${kind}'`);
  }
  return narrowResolverResult(json, kind);
};

/**
 * Re-validate the remote payload against the known `UriResolverResult`
 * variants. The discriminator has already been checked; this confirms the
 * shape of each variant's required fields so a malformed remote response is
 * rejected (→ `pillar-unavailable`) rather than propagated to consumers.
 */
function narrowResolverResult(json: object, kind: UriResolverResult['kind']): UriResolverResult {
  const read = (key: string): unknown => Reflect.get(json, key);
  const str = (key: string): string => {
    const value = read(key);
    if (typeof value !== 'string') {
      throw new Error(`remote result missing string field '${key}'`);
    }
    return value;
  };

  switch (kind) {
    case 'object':
      return {
        kind,
        moduleId: str('moduleId'),
        type: str('type'),
        id: str('id'),
        data: read('data'),
      };
    case 'not-found':
      return { kind, moduleId: str('moduleId'), type: str('type'), id: str('id') };
    case 'module-absent':
      return { kind, moduleId: str('moduleId') };
    case 'pillar-unavailable':
      return { kind, moduleId: str('moduleId'), reason: str('reason') };
    case 'malformed':
      return { kind, uri: str('uri'), reason: str('reason') };
  }
}

function describeRemoteError(err: unknown, timeoutMs: number, aborted: boolean): string {
  if (aborted) return `timed out after ${timeoutMs}ms`;
  if (err instanceof Error) return err.message;
  return 'unknown error';
}
