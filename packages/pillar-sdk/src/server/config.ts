import type { HttpDiscoveryTransportOptions } from '../client/index.js';

/**
 * Caller-provided overrides for the process-wide server SDK.
 *
 * Every field is optional. `configureServerSdk` is intended to be called
 * once at process boot (e.g. in `bootstrapPillar`'s server wiring, or in
 * the top of a worker entry-point), but it is safe to call multiple times
 * — later calls shallow-merge into the existing config.
 */
export type ServerSdkConfig = {
  /**
   * Service-account API key sent as `X-API-Key` on every outbound call.
   * When omitted, the SDK falls back to `process.env.POPS_INTERNAL_API_KEY`
   * at call time. Explicit > env.
   */
  apiKey?: string;

  /**
   * Custom fetch implementation. Server callers typically wire this to a
   * keepalive-enabled fetch (e.g. `undici`'s pool-backed fetch) to get
   * connection reuse without paying TCP handshake costs per call.
   */
  fetchImpl?: typeof fetch;

  /**
   * Default per-call timeout for outbound pillar-to-pillar requests.
   * Defaults to 30s in the underlying client.
   */
  callTimeoutMs?: number;

  /**
   * Default registry discovery TTL.
   */
  cacheTtlMs?: number;

  /**
   * Registry transport overrides. The same shape accepted by the client
   * `HttpDiscoveryTransport` — internal Docker hostnames for the registry,
   * a custom timeout, extra headers, etc.
   */
  registry?: HttpDiscoveryTransportOptions;

  /**
   * Optional per-pillar base-URL overrides. Useful for local development
   * where a sibling pillar is reachable on `localhost` rather than the
   * registry-published Docker hostname. The override is matched by
   * `pillarId`; if absent, the discovery baseUrl is used as-is.
   */
  internalBaseUrls?: Record<string, string>;
};

const SERVER_API_KEY_ENV = 'POPS_INTERNAL_API_KEY';

let currentConfig: ServerSdkConfig = {};

/**
 * Set or update the process-wide server SDK configuration. Repeated calls
 * shallow-merge — pass `{ apiKey: undefined }` to clear a single field if
 * needed.
 */
export function configureServerSdk(config: ServerSdkConfig): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Read the active server SDK config. Exposed for the factory and tests;
 * not part of the public surface.
 */
export function getServerSdkConfig(): Readonly<ServerSdkConfig> {
  return currentConfig;
}

/**
 * Reset config back to empty. Used by tests; not exported from the
 * package entry-point.
 */
export function __resetServerSdkConfig(): void {
  currentConfig = {};
}

/**
 * Resolve the service-account API key. Caller-supplied config wins over
 * the env var; an empty string is treated as unset.
 */
export function resolveApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const fromConfig = currentConfig.apiKey;
  if (fromConfig !== undefined && fromConfig.length > 0) return fromConfig;
  const fromEnv = env[SERVER_API_KEY_ENV];
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  return undefined;
}

export const SERVER_SDK_API_KEY_ENV = SERVER_API_KEY_ENV;
