import {
  HttpDiscoveryTransport,
  pillar as clientPillar,
  type DiscoveryTransport,
  type PillarClientOptions,
  type PillarHandle,
} from '../client/index.js';
import { getServerSdkConfig, resolveApiKey, SERVER_SDK_API_KEY_ENV } from './config.js';
import { PillarServerSdkError } from './errors.js';
import { InternalBaseUrlTransport } from './transport.js';

/**
 * Per-call options for the server `pillar()`. Mirrors the client options
 * but with server-specific knobs only:
 *
 * - `contractVersion`: opt-in major-version pinning, identical semantics
 *   to the client.
 * - `transport`, `fetchImpl`, `cacheTtlMs`: escape hatches for tests.
 *   Production callers should configure these via {@link configureServerSdk}
 *   and let the per-call handle reuse them.
 */
export type ServerPillarOptions = {
  contractVersion?: string;
  transport?: DiscoveryTransport;
  fetchImpl?: typeof fetch;
  cacheTtlMs?: number;
};

type CacheKey = string;

type CachedHandle = {
  handle: PillarHandle<unknown>;
  configSnapshot: object;
};

const handleCache = new Map<CacheKey, CachedHandle>();

/**
 * Server-side `pillar()`. Same proxy shape as the client surface, but:
 *
 *  - Authenticates with the `POPS_INTERNAL_API_KEY` env var (or a key set
 *    via {@link configureServerSdk}) as `X-API-Key`.
 *  - Reuses a per-pillar handle (and therefore its discovery cache) across
 *    calls within the same process, so a worker hitting `pillar('finance')`
 *    in a tight loop does one registry fetch per TTL window.
 *  - Optionally rewrites discovered base URLs via the configured
 *    `internalBaseUrls` map.
 *
 * Throws {@link PillarServerSdkError} on first call if no service-account
 * key is available — server-to-server traffic must be authenticated.
 *
 * @example
 * configureServerSdk({ apiKey: process.env.POPS_INTERNAL_API_KEY });
 * const finance = pillar<FinanceRouter>('finance');
 * const movies = await finance.wishlist.list({ limit: 10 });
 */
export function pillar<TRouter>(
  pillarId: string,
  options: ServerPillarOptions = {}
): PillarHandle<TRouter> {
  if (resolveApiKey() === undefined) {
    throw new PillarServerSdkError(
      `service-account auth required for server-side SDK: set ${SERVER_SDK_API_KEY_ENV} or call configureServerSdk({ apiKey }).`
    );
  }

  const config = getServerSdkConfig();
  const cacheKey = buildCacheKey(pillarId, options);
  const configSnapshot = snapshotConfig(config, options);
  const existing = handleCache.get(cacheKey);
  if (existing !== undefined && shallowEqual(existing.configSnapshot, configSnapshot)) {
    return existing.handle as PillarHandle<TRouter>;
  }

  const clientOptions = buildClientOptions(config, options);
  const handle = clientPillar<TRouter>(pillarId, clientOptions);
  handleCache.set(cacheKey, {
    handle: handle as PillarHandle<unknown>,
    configSnapshot,
  });
  return handle;
}

function buildClientOptions(
  config: ReturnType<typeof getServerSdkConfig>,
  options: ServerPillarOptions
): PillarClientOptions {
  const transport = resolveTransport(config, options);
  const clientOptions: PillarClientOptions = {
    transport,
    authHeaders: () => {
      const current = resolveApiKey();
      if (current === undefined) {
        throw new PillarServerSdkError(
          `service-account auth required for server-side SDK call: set ${SERVER_SDK_API_KEY_ENV} or call configureServerSdk({ apiKey }).`
        );
      }
      return { 'x-api-key': current };
    },
  };
  const fetchImpl = options.fetchImpl ?? config.fetchImpl;
  if (fetchImpl !== undefined) clientOptions.fetchImpl = fetchImpl;
  if (options.cacheTtlMs !== undefined) clientOptions.cacheTtlMs = options.cacheTtlMs;
  else if (config.cacheTtlMs !== undefined) clientOptions.cacheTtlMs = config.cacheTtlMs;
  if (config.callTimeoutMs !== undefined) clientOptions.callTimeoutMs = config.callTimeoutMs;
  if (options.contractVersion !== undefined)
    clientOptions.contractVersion = options.contractVersion;
  return clientOptions;
}

function resolveTransport(
  config: ReturnType<typeof getServerSdkConfig>,
  options: ServerPillarOptions
): DiscoveryTransport {
  if (options.transport !== undefined) {
    return wrapWithOverrides(options.transport, config.internalBaseUrls);
  }
  const base = new HttpDiscoveryTransport(config.registry ?? {});
  return wrapWithOverrides(base, config.internalBaseUrls);
}

function wrapWithOverrides(
  inner: DiscoveryTransport,
  overrides: Record<string, string> | undefined
): DiscoveryTransport {
  if (overrides === undefined || Object.keys(overrides).length === 0) return inner;
  return new InternalBaseUrlTransport(inner, overrides);
}

function buildCacheKey(pillarId: string, options: ServerPillarOptions): CacheKey {
  return `${pillarId}::${options.contractVersion ?? ''}::${options.transport ? 'custom-transport' : 'default-transport'}::${options.fetchImpl ? 'custom-fetch' : 'default-fetch'}::${options.cacheTtlMs ?? ''}`;
}

function snapshotConfig(
  config: ReturnType<typeof getServerSdkConfig>,
  options: ServerPillarOptions
): object {
  return {
    apiKey: config.apiKey ?? null,
    fetchImpl: config.fetchImpl ?? null,
    callTimeoutMs: config.callTimeoutMs ?? null,
    cacheTtlMs: options.cacheTtlMs ?? config.cacheTtlMs ?? null,
    registry: config.registry ?? null,
    internalBaseUrls: config.internalBaseUrls ?? null,
    transport: options.transport ?? null,
    fetchOverride: options.fetchImpl ?? null,
    contractVersion: options.contractVersion ?? null,
  };
}

function shallowEqual(a: object, b: object): boolean {
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  if (ak.length !== bk.length) return false;
  const ar = a as Record<string, unknown>;
  const br = b as Record<string, unknown>;
  for (const k of ak) {
    if (ar[k] !== br[k]) return false;
  }
  return true;
}

/**
 * Drop every memoised pillar handle. Used by tests; production callers
 * should rely on TTL-based discovery refresh instead.
 */
export function __resetServerPillarCache(): void {
  handleCache.clear();
}
