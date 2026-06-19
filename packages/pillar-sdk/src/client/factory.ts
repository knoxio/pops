import { DiscoveryCache } from './cache.js';
import {
  HttpDiscoveryTransport,
  type DiscoveryTransport,
  type HttpDiscoveryTransportOptions,
} from './discovery.js';
import { PillarSdkError, type CallFailure, type CallResult } from './errors.js';
import { getRouteMap } from './openapi-source.js';
import { buildPillarProxy, type PillarHandle } from './proxy.js';
import { performRestCall } from './rest-call.js';

import type { DiscoveredPillar } from './discovery.js';
import type { RouteMap } from './openapi-route-map.js';

export type { PillarHandle } from './proxy.js';

const DEFAULT_CACHE_TTL_MS = 60_000;

export type PillarClientOptions = {
  transport?: DiscoveryTransport;
  cacheTtlMs?: number;
  callTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  authHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  contractVersion?: string;
  registry?: HttpDiscoveryTransportOptions;
};

type CachedClient = {
  cache: DiscoveryCache;
  fetchImpl: typeof fetch;
};

let sharedClient: CachedClient | null = null;

function isCustomConfig(options: PillarClientOptions): boolean {
  return (
    options.transport !== undefined ||
    options.cacheTtlMs !== undefined ||
    options.registry !== undefined ||
    options.fetchImpl !== undefined
  );
}

function getSharedClient(options: PillarClientOptions): CachedClient {
  if (isCustomConfig(options)) {
    const transport = options.transport ?? new HttpDiscoveryTransport(options.registry ?? {});
    return {
      cache: new DiscoveryCache({
        transport,
        ttlMs: options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
      }),
      fetchImpl: options.fetchImpl ?? fetch,
    };
  }
  if (sharedClient !== null) return sharedClient;
  const transport = new HttpDiscoveryTransport();
  sharedClient = {
    cache: new DiscoveryCache({ transport, ttlMs: DEFAULT_CACHE_TTL_MS }),
    fetchImpl: fetch,
  };
  return sharedClient;
}

export function __resetSharedPillarClient(): void {
  sharedClient = null;
}

export function pillar<TRouter>(
  pillarId: string,
  options: PillarClientOptions = {}
): PillarHandle<TRouter> {
  const client = getSharedClient(options);
  const ctx: InvokeContext = { pillarId, client, options };
  const proxy = buildPillarProxy(pillarId, (path, input) => invoke(ctx, path, input));
  return proxy as PillarHandle<TRouter>;
}

type InvokeContext = {
  pillarId: string;
  client: CachedClient;
  options: PillarClientOptions;
};

async function invoke(
  ctx: InvokeContext,
  path: readonly string[],
  input: unknown
): Promise<CallResult<unknown>> {
  if (path.length < 2) {
    return {
      kind: 'contract-mismatch',
      pillar: ctx.pillarId,
      actual: path.join('.'),
    };
  }

  const discovered = await safeLookup(ctx.client, ctx.pillarId);
  const guard = guardAvailability(ctx.pillarId, discovered, ctx.options.contractVersion);
  if (guard) return guard;

  const resolved = discovered as DiscoveredPillar;
  const routes = await safeRouteMap(ctx.pillarId, resolved, ctx.client.fetchImpl);
  if (routes === undefined) {
    return {
      kind: 'contract-mismatch',
      pillar: ctx.pillarId,
      expected: path.join('.'),
      message: 'pillar serves no /openapi contract',
    };
  }

  return performRestCall({
    pillarId: ctx.pillarId,
    discovered: resolved,
    path,
    input,
    routes,
    fetchImpl: ctx.client.fetchImpl,
    authHeaders: ctx.options.authHeaders,
    callTimeoutMs: ctx.options.callTimeoutMs,
  });
}

/**
 * Resolve the target pillar's OpenAPI route map for the REST transport.
 *
 * A failed fetch/parse throws a {@link PillarSdkError} (see `openapi-source.ts`);
 * that is collapsed to `undefined` here so the caller surfaces a REST-only
 * `contract-mismatch` failure — the lake is REST-only, so a pillar that
 * publishes no `/openapi` has no contract the SDK can call. Any non-SDK error
 * (a programming fault) propagates.
 */
async function safeRouteMap(
  pillarId: string,
  discovered: DiscoveredPillar,
  fetchImpl: typeof fetch
): Promise<RouteMap | undefined> {
  try {
    return await getRouteMap(pillarId, discovered, fetchImpl);
  } catch (cause) {
    if (cause instanceof PillarSdkError) return undefined;
    throw cause;
  }
}

async function safeLookup(
  client: CachedClient,
  pillarId: string
): Promise<DiscoveredPillar | undefined> {
  try {
    return await client.cache.lookup(pillarId);
  } catch (cause) {
    if (cause instanceof PillarSdkError) return undefined;
    throw cause;
  }
}

function guardAvailability(
  pillarId: string,
  discovered: DiscoveredPillar | undefined,
  expectedVersion: string | undefined
): CallFailure | null {
  if (!discovered || !discovered.registered) {
    return { kind: 'unavailable', pillar: pillarId };
  }
  if (discovered.status === 'unavailable') {
    return { kind: 'unavailable', pillar: pillarId };
  }
  if (discovered.status === 'unknown') {
    return { kind: 'degraded', pillar: pillarId, reason: 'reconciling' };
  }
  return detectContractMismatch(pillarId, discovered, expectedVersion);
}

function detectContractMismatch(
  pillarId: string,
  discovered: DiscoveredPillar,
  expected: string | undefined
): CallFailure | null {
  if (!expected) return null;
  const actual = discovered.manifest.contract.version;
  if (majorOf(expected) === majorOf(actual)) return null;
  return { kind: 'contract-mismatch', pillar: pillarId, expected, actual };
}

function majorOf(version: string): string {
  const idx = version.indexOf('.');
  return idx === -1 ? version : version.slice(0, idx);
}
