import {
  createResolverLeg,
  resolveWithFallback,
  type ResolverLeg,
} from '../registry-path-resolver.js';
import { LEGACY_REGISTRY_PATHS, REGISTRY_PATHS } from '../registry-paths.js';
import { PillarSdkError } from './errors.js';

import type { ManifestPayload } from '../manifest-schema/index.js';

const HTTP_NOT_FOUND = 404;

function isSnapshotNotFound(err: unknown): boolean {
  return err instanceof PillarSdkError && err.status === HTTP_NOT_FOUND;
}

/**
 * The shape returned by the registry discovery snapshot (PRD-161 / PRD-159).
 * Served at the canonical `GET /registry/pillars` ({@link REGISTRY_PATHS}.snapshot)
 * with a 404 fallback to the legacy `GET /core.registry.list` during the
 * rolling-deploy window. One entry per registered pillar.
 */
export type DiscoveredPillar = {
  pillarId: string;
  baseUrl: string;
  status: 'healthy' | 'unavailable' | 'unknown';
  manifest: ManifestPayload;
  lastSeenAt: string;
  registered: boolean;
};

/**
 * The transport the client uses to fetch the registry snapshot. The
 * default HTTP impl reads the discovery snapshot slash-first from
 * `/registry/pillars`, falling back to the legacy `/core.registry.list` on a
 * 404 during the rolling-deploy window; tests inject a fake. Decoupling the
 * transport keeps the client unit-testable without a live registry and lets
 * future deployments swap to an SSE / file / in-process variant without
 * touching `pillar()`.
 */
export interface DiscoveryTransport {
  fetchSnapshot(): Promise<readonly DiscoveredPillar[]>;
}

export type HttpDiscoveryTransportOptions = {
  registryUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

const DEFAULT_REGISTRY_URL = 'http://core-api:3001';

const DEFAULT_FETCH_TIMEOUT_MS = 5_000;

/**
 * Default HTTP transport. Fetches the core registry's DB-backed snapshot over
 * the raw HTTP wire and reshapes the response into `DiscoveredPillar[]`.
 *
 * Wire shape (raw — no tRPC):
 *   GET /registry/pillars     (canonical; on 404 falls back to the legacy
 *                              GET /core.registry.list during the rollout)
 *   → { pillars: [...], fetchedAt: ... }
 *
 * The transport is long-lived, so it caches the winning path as a HINT and
 * re-expands to both candidates on a 404 against the cached path (a core
 * rollback / lagging replica) — self-healing, never hard-evicting. A 5xx
 * surfaces immediately without falling back. The body parser still tolerates a
 * `{ result: { data } }` envelope so a mixed deployment reads either.
 */
export class HttpDiscoveryTransport implements DiscoveryTransport {
  private readonly registryUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;
  private readonly leg: ResolverLeg;

  constructor(options: HttpDiscoveryTransportOptions = {}) {
    this.registryUrl = options.registryUrl ?? DEFAULT_REGISTRY_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    this.headers = options.headers ?? {};
    this.leg = createResolverLeg(REGISTRY_PATHS.snapshot, LEGACY_REGISTRY_PATHS.snapshot);
  }

  async fetchSnapshot(): Promise<readonly DiscoveredPillar[]> {
    return resolveWithFallback(this.leg, isSnapshotNotFound, (path) => this.fetchFromPath(path));
  }

  private async fetchFromPath(path: string): Promise<readonly DiscoveredPillar[]> {
    const url = `${this.registryUrl.replace(/\/$/, '')}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json', ...this.headers },
        signal: controller.signal,
      });
    } catch (cause) {
      throw new PillarSdkError(`registry fetch failed: ${describeError(cause)}`, { cause });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new PillarSdkError(`registry returned HTTP ${response.status} ${response.statusText}`, {
        status: response.status,
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new PillarSdkError('registry returned non-JSON body', { cause });
    }

    return parseRegistryResponse(body);
  }
}

function parseRegistryResponse(body: unknown): readonly DiscoveredPillar[] {
  const data = extractTrpcData(body);
  if (!isRecord(data)) {
    throw new PillarSdkError('registry snapshot missing data payload');
  }
  const pillars = data['pillars'];
  if (!Array.isArray(pillars)) {
    throw new PillarSdkError('registry snapshot pillars field is not an array');
  }
  return pillars.map(parseRegistryEntry);
}

function parseRegistryEntry(entry: unknown, index: number): DiscoveredPillar {
  if (!isRecord(entry)) {
    throw new PillarSdkError(`registry snapshot entry ${index} is not an object`);
  }
  return {
    pillarId: requireString(entry, 'pillarId', index),
    baseUrl: requireString(entry, 'baseUrl', index),
    status: requireStatus(entry['status'], index),
    manifest: requireManifest(entry['manifest'], index),
    lastSeenAt: requireLastSeenAt(entry, index),
    registered: requireRegistered(entry['registered'], index),
  };
}

/**
 * Core-api emits `lastHeartbeatAt`; older / mocked surfaces emit
 * `lastSeenAt`. Accept either and normalise to `lastSeenAt` so callers
 * keep a single field name.
 */
function requireLastSeenAt(entry: Record<string, unknown>, index: number): string {
  const seen = entry['lastSeenAt'];
  if (typeof seen === 'string' && seen.length > 0) return seen;
  const heartbeat = entry['lastHeartbeatAt'];
  if (typeof heartbeat === 'string' && heartbeat.length > 0) return heartbeat;
  throw new PillarSdkError(`registry snapshot entry ${index} missing lastSeenAt / lastHeartbeatAt`);
}

function requireString(entry: Record<string, unknown>, key: string, index: number): string {
  const value = entry[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new PillarSdkError(`registry snapshot entry ${index} missing ${key}`);
  }
  return value;
}

function requireStatus(value: unknown, index: number): 'healthy' | 'unavailable' | 'unknown' {
  if (value === 'healthy' || value === 'unavailable' || value === 'unknown') {
    return value;
  }
  throw new PillarSdkError(`registry snapshot entry ${index} has unknown status: ${String(value)}`);
}

function requireManifest(value: unknown, index: number): ManifestPayload {
  if (!isRecord(value)) {
    throw new PillarSdkError(`registry snapshot entry ${index} missing manifest`);
  }
  return value as ManifestPayload;
}

function requireRegistered(value: unknown, index: number): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'boolean') {
    throw new PillarSdkError(`registry snapshot entry ${index} registered is not boolean`);
  }
  return value;
}

function extractTrpcData(body: unknown): unknown {
  if (!isRecord(body)) return body;
  const result = body['result'];
  if (isRecord(result) && 'data' in result) return result['data'];
  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
