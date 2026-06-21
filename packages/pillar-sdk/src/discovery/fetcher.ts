import {
  createResolverLeg,
  resolveWithFallback,
  type ResolverLeg,
} from '../registry-path-resolver.js';
import { LEGACY_REGISTRY_PATHS, REGISTRY_PATHS } from '../registry-paths.js';
import {
  parseRegistrySnapshotResponse,
  type PillarRegistryEntryPayload,
} from './snapshot-schema.js';

import type { PillarSnapshot } from './types.js';

const HTTP_NOT_FOUND = 404;

export type FetcherOptions = {
  registryUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  /**
   * Slash-first resolver leg shared across calls. Omit it and the fetcher uses
   * a fresh leg per call (still slash-first with a 404 fallback, just without
   * cross-call caching). Pass a long-lived leg — as the cache layer's
   * `createDefaultFetcher` does — to cache the winning path between polls and
   * self-heal on a later 404.
   */
  leg?: ResolverLeg;
};

export type RegistryFetchResult = {
  pillars: PillarSnapshot[];
  fetchedAt: Date;
};

export const DEFAULT_FETCH_TIMEOUT_MS = 5_000;

/**
 * HTTP status-aware discovery error. Carries the response status so the
 * slash-first resolver can tell a 404 (unknown path → fall back to the legacy
 * snapshot path) from a 5xx (registry up but broken → surface without
 * falling back).
 */
export class DiscoveryFetchError extends Error {
  override readonly name = 'DiscoveryFetchError';
  readonly status: number;
  constructor(status: number, statusText: string) {
    super(`discovery fetch: HTTP ${status} ${statusText}`);
    this.status = status;
  }
}

/** Build a slash-first resolver leg for the discovery snapshot path. */
export function createSnapshotResolverLeg(): ResolverLeg {
  return createResolverLeg(REGISTRY_PATHS.snapshot, LEGACY_REGISTRY_PATHS.snapshot);
}

function isSnapshotNotFound(err: unknown): boolean {
  return err instanceof DiscoveryFetchError && err.status === HTTP_NOT_FOUND;
}

/**
 * One-shot fetch of the registry discovery snapshot (PRD-161). Resolves the
 * canonical slash path `GET /registry/pillars` ({@link REGISTRY_PATHS}.snapshot)
 * first, falling back to the legacy `GET /core.registry.list`
 * ({@link LEGACY_REGISTRY_PATHS}.snapshot) on a 404 during the rolling-deploy
 * window. A 5xx surfaces immediately without falling back.
 *
 * - 5s timeout via `AbortController` (configurable, but 5s is the default
 *   the PRD-159 contract calls out).
 * - Aborts surface as plain `Error` instances; the cache layer converts
 *   them to {@link RegistryUnreachableError} when appropriate.
 * - Zod-validates the response (per PRD-159 §Edge Cases:
 *   malformed JSON / schema failure → treated as a fetch failure).
 */
export async function fetchRegistrySnapshot(options: FetcherOptions): Promise<RegistryFetchResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('discovery fetcher: no fetch implementation available');
  }
  const leg = options.leg ?? createSnapshotResolverLeg();
  const fetchLeg: FetchLeg = {
    fetchImpl,
    timeoutMs: options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
    now: options.now ?? Date.now,
  };
  return resolveWithFallback(leg, isSnapshotNotFound, (path) =>
    fetchFromPath(path, fetchLeg, options.registryUrl)
  );
}

type FetchLeg = {
  fetchImpl: typeof fetch;
  timeoutMs: number;
  now: () => number;
};

async function fetchFromPath(
  path: string,
  leg: FetchLeg,
  registryUrl: string
): Promise<RegistryFetchResult> {
  const url = `${registryUrl.replace(/\/$/, '')}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('discovery fetch timeout')),
    leg.timeoutMs
  );

  let response: Response;
  try {
    response = await leg.fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new DiscoveryFetchError(response.status, response.statusText);
  }

  const body = await readJson(response);
  const payload = parseRegistrySnapshotResponse(body);

  return {
    pillars: payload.pillars.map(toPillarSnapshot),
    fetchedAt: new Date(leg.now()),
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (cause) {
    const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
    throw new Error(`discovery fetch: malformed JSON body: ${preview}`, { cause });
  }
}

function toPillarSnapshot(entry: PillarRegistryEntryPayload): PillarSnapshot {
  const lastSeenAt = new Date(entry.lastSeenAt);
  if (Number.isNaN(lastSeenAt.getTime())) {
    throw new Error(`discovery fetch: invalid lastSeenAt for pillar ${entry.pillarId}`);
  }
  const registered = resolveRegistered(entry);
  return {
    pillarId: entry.pillarId,
    baseUrl: entry.baseUrl,
    manifest: entry.manifest,
    registered,
    lastSeenAt,
    ...(entry.status !== undefined ? { status: entry.status } : {}),
    ...(entry.capabilities !== undefined ? { capabilities: entry.capabilities } : {}),
  };
}

function resolveRegistered(entry: PillarRegistryEntryPayload): boolean {
  if (typeof entry.registered === 'boolean') return entry.registered;
  if (entry.status === 'unknown') return false;
  return true;
}
