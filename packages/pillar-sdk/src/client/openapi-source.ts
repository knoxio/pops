/**
 * OpenAPI source for the REST transport.
 *
 * The REST transport ({@link performRestCall}) resolves a `[domain, proc]`
 * call against a pillar's operationId {@link RouteMap}. That map is derived
 * from the pillar's OpenAPI document, served at `GET ${baseUrl}/openapi` (the
 * raw self-describing route added to every collapsed pillar). Fetching and
 * parsing that document on every call would be wasteful, so this module caches
 * the built route map per pillar with the same TTL / in-flight-dedup /
 * lazy-refresh semantics as the discovery cache (`cache.ts`).
 *
 * Fetch / parse failures throw a typed {@link PillarSdkError}; the caller
 * (the REST invoke path) maps that to `{ kind: 'unavailable' }`, mirroring how
 * a rejected `fetch` is handled in `rest-call.ts`. This keeps "the pillar's
 * contract could not be read" indistinguishable, from the caller's side, from
 * "the pillar did not answer" — both are an unavailable upstream.
 *
 * ADDITIVE: nothing here is wired into the default (tRPC) transport. The flip
 * lands in a later increment; for now this is the source the REST path will use.
 */
import { PillarSdkError } from './errors.js';
import { buildRouteMap, type OpenApiDocument, type RouteMap } from './openapi-route-map.js';

import type { DiscoveredPillar } from './discovery.js';

const DEFAULT_OPENAPI_TTL_MS = 5 * 60_000;

const DEFAULT_OPENAPI_FETCH_TIMEOUT_MS = 5_000;

type OpenApiCacheEntry = {
  routeMap: RouteMap;
  fetchedAt: number;
};

/**
 * TTL'd, per-pillar memoizing cache of OpenAPI-derived {@link RouteMap}s.
 *
 * One in-flight fetch is shared across concurrent callers for the SAME pillar;
 * a second concurrent `getRouteMap(pillarId, ...)` joins the same promise
 * rather than firing a parallel HTTP request. Distinct pillars fetch
 * independently. Expired entries refetch lazily on the next call. A failed
 * fetch is NOT cached — the rejected promise propagates and the next call
 * retries from scratch.
 *
 * Mirrors `DiscoveryCache`'s shape so the two caches read the same way; the
 * sole structural difference is the per-pillar keying (the discovery cache
 * holds a single snapshot keyed by nothing).
 */
export class OpenApiSourceCache {
  private readonly fetchImpl: typeof fetch;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  private readonly entries = new Map<string, OpenApiCacheEntry>();
  private readonly inFlight = new Map<string, Promise<OpenApiCacheEntry>>();

  hitCount = 0;
  missCount = 0;
  refreshCount = 0;

  constructor(options: {
    fetchImpl: typeof fetch;
    ttlMs?: number;
    timeoutMs?: number;
    now?: () => number;
  }) {
    this.fetchImpl = options.fetchImpl;
    this.ttlMs = options.ttlMs ?? DEFAULT_OPENAPI_TTL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_OPENAPI_FETCH_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * Resolve the route map for `pillarId`, fetching `${baseUrl}/openapi` on a
   * cache miss / expiry. `discovered.baseUrl` is the only field read.
   *
   * @throws PillarSdkError if the document cannot be fetched or parsed.
   */
  async getRouteMap(pillarId: string, discovered: DiscoveredPillar): Promise<RouteMap> {
    const current = this.entries.get(pillarId);
    if (current !== undefined && this.now() - current.fetchedAt < this.ttlMs) {
      this.hitCount += 1;
      return current.routeMap;
    }

    const pending = this.inFlight.get(pillarId);
    if (pending !== undefined) return (await pending).routeMap;

    this.missCount += 1;
    const refresh = this.refresh(pillarId, discovered.baseUrl);
    this.inFlight.set(pillarId, refresh);
    return (await refresh).routeMap;
  }

  /** Drop every cached map, or just one pillar's when `pillarId` is given. */
  invalidate(pillarId?: string): void {
    if (pillarId === undefined) {
      this.entries.clear();
      return;
    }
    this.entries.delete(pillarId);
  }

  private async refresh(pillarId: string, baseUrl: string): Promise<OpenApiCacheEntry> {
    try {
      const doc = await this.fetchOpenApi(pillarId, baseUrl);
      const entry: OpenApiCacheEntry = {
        routeMap: buildRouteMap(doc),
        fetchedAt: this.now(),
      };
      this.entries.set(pillarId, entry);
      this.refreshCount += 1;
      return entry;
    } finally {
      this.inFlight.delete(pillarId);
    }
  }

  private async fetchOpenApi(pillarId: string, baseUrl: string): Promise<OpenApiDocument> {
    const url = `${baseUrl.replace(/\/$/, '')}/openapi`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (cause) {
      throw new PillarSdkError(
        `pillar('${pillarId}') openapi fetch failed: ${describeError(cause)}`,
        { cause }
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new PillarSdkError(
        `pillar('${pillarId}') openapi returned HTTP ${response.status} ${response.statusText}`
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new PillarSdkError(`pillar('${pillarId}') openapi returned non-JSON body`, { cause });
    }

    if (!isOpenApiDocument(body)) {
      throw new PillarSdkError(`pillar('${pillarId}') openapi body is not an OpenAPI document`);
    }
    return body;
  }
}

/**
 * Structural guard for the slice of an OpenAPI document the route map reads.
 * Only `paths` is consumed, and only when it is an object; a document with a
 * missing / empty `paths` yields an empty route map (every call then resolves
 * to `contract-mismatch`), which is a legitimate — if useless — pillar.
 */
function isOpenApiDocument(value: unknown): value is OpenApiDocument {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const paths = (value as { paths?: unknown }).paths;
  return (
    paths === undefined || (typeof paths === 'object' && paths !== null && !Array.isArray(paths))
  );
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Process-wide default cache, lazily bound to a `fetchImpl` on first use. The
 * functional {@link getRouteMap} entry point reads/writes this so call sites
 * that don't own a cache instance still share one fetch per pillar.
 */
let sharedCache: OpenApiSourceCache | null = null;

function sharedCacheFor(fetchImpl: typeof fetch): OpenApiSourceCache {
  if (sharedCache === null) {
    sharedCache = new OpenApiSourceCache({ fetchImpl });
  }
  return sharedCache;
}

/** Test seam: drop the process-wide shared cache. */
export function __resetSharedOpenApiCache(): void {
  sharedCache = null;
}

/**
 * Resolve (and cache) the {@link RouteMap} for a discovered pillar by fetching
 * `${discovered.baseUrl}/openapi`. The first call for a pillar fetches and
 * caches; subsequent calls within the TTL reuse the cached map.
 *
 * Uses the process-wide shared cache. Tests that need isolation construct an
 * {@link OpenApiSourceCache} directly and call `getRouteMap` on it.
 *
 * @throws PillarSdkError if the document cannot be fetched or parsed.
 */
export function getRouteMap(
  pillarId: string,
  discovered: DiscoveredPillar,
  fetchImpl: typeof fetch
): Promise<RouteMap> {
  return sharedCacheFor(fetchImpl).getRouteMap(pillarId, discovered);
}
