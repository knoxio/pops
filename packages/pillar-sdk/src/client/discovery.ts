import { PillarSdkError } from './errors.js';

import type { ManifestPayload } from '../manifest-schema/index.js';

/**
 * The shape returned by `core.registry.list` (PRD-161 / PRD-159).
 * One entry per registered pillar.
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
 * default HTTP impl talks to `core.registry.list`; tests inject a
 * fake. Decoupling the transport keeps the client unit-testable without
 * a live registry and lets future deployments swap to an SSE / file /
 * in-process variant without touching `pillar()`.
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
 * Default HTTP transport. Calls `core.registry.list` over the tRPC
 * GET wire format and reshapes the response into `DiscoveredPillar[]`.
 *
 * tRPC's HTTP GET shape:
 *   GET /trpc/core.registry.list
 *   → { result: { data: { pillars: [...], fetchedAt: ... } } }
 */
export class HttpDiscoveryTransport implements DiscoveryTransport {
  private readonly registryUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;

  constructor(options: HttpDiscoveryTransportOptions = {}) {
    this.registryUrl = options.registryUrl ?? DEFAULT_REGISTRY_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    this.headers = options.headers ?? {};
  }

  async fetchSnapshot(): Promise<readonly DiscoveredPillar[]> {
    const url = `${this.registryUrl.replace(/\/$/, '')}/trpc/core.registry.list`;
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
      throw new PillarSdkError(`registry returned HTTP ${response.status} ${response.statusText}`);
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
    lastSeenAt: requireString(entry, 'lastSeenAt', index),
    registered: requireRegistered(entry['registered'], index),
  };
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
