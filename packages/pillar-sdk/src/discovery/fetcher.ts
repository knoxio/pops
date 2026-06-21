import {
  parseRegistrySnapshotResponse,
  type PillarRegistryEntryPayload,
} from './snapshot-schema.js';

import type { PillarSnapshot } from './types.js';

export type FetcherOptions = {
  registryUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
};

export type RegistryFetchResult = {
  pillars: PillarSnapshot[];
  fetchedAt: Date;
};

export const DEFAULT_FETCH_TIMEOUT_MS = 5_000;

/**
 * One-shot fetch of the registry discovery snapshot (PRD-161) — canonical
 * `GET /registry/pillars` (legacy `GET /core.registry.list` still served
 * in-cluster until the dotted shape is removed).
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const now = options.now ?? Date.now;

  const url = buildRegistryListUrl(options.registryUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('discovery fetch timeout')), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`discovery fetch: HTTP ${response.status} ${response.statusText}`);
  }

  const body = await readJson(response);
  const payload = parseRegistrySnapshotResponse(body);

  return {
    pillars: payload.pillars.map(toPillarSnapshot),
    fetchedAt: new Date(now()),
  };
}

function buildRegistryListUrl(registryUrl: string): string {
  return `${registryUrl.replace(/\/$/, '')}/core.registry.list`;
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
  };
}

function resolveRegistered(entry: PillarRegistryEntryPayload): boolean {
  if (typeof entry.registered === 'boolean') return entry.registered;
  if (entry.status === 'unknown') return false;
  return true;
}
