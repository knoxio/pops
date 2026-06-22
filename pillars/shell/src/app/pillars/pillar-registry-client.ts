import { REGISTRY_PILLAR_ID } from './manifest-pillar';

/**
 * Browser-side fetch helpers for the pillar boot endpoints (ADR-026 P3).
 *
 * The shell never reads `POPS_PILLARS` directly — that env var lives on
 * the registry pillar. The shell consults two HTTP endpoints at boot:
 *
 *   GET /pillars         → `{ pillars: PillarRegistryEntry[] }`
 *   GET /pillars/health  → `{ health: Record<id, 'healthy' | 'unavailable'> }`
 *
 * Pillar `baseUrl`s in the registry are container-network addresses
 * (e.g. `http://registry-api:3001`) and are NOT reachable from the
 * browser. The shell stores them in the boot snapshot for downstream
 * UI (status badges, ops surfaces) but never opens a browser-to-pillar
 * connection itself; cross-pillar HTTP fan-out runs on `/pillars/health`
 * aggregator instead.
 *
 * Routing (pillars/shell/nginx.conf):
 *   - `/pillars` and `/pillars/health` proxy to registry-api (the
 *     authoritative snapshot + the aggregator's outbound probe loop both
 *     live on the registry pillar).
 *
 * Failures are intentionally soft. A registry fetch that errors,
 * parses to the wrong shape, or returns an empty list collapses to
 * the synthetic `registry` self-entry so the shell always has at least
 * one pillar to reason about. A health fetch that fails returns an
 * empty map, which the provider exposes as `'unknown'` for every
 * pillar — `PillarGuard` treats unknown as healthy so a slow / failed
 * boot does not paint placeholders over working routes.
 */
import type { PillarRegistryEntry } from '@pops/types';

import type { PillarHealthStatus } from './types';

const REGISTRY_URL = '/pillars';
const HEALTH_URL = '/pillars/health';

/** Per-request timeout for boot fetches. */
const DEFAULT_TIMEOUT_MS = 3000;

export interface PillarFetchOptions {
  /** Override the global `fetch` (tests inject a stub). */
  readonly fetch?: typeof fetch;
  /** Per-fetch timeout in milliseconds. Defaults to 3000. */
  readonly timeoutMs?: number;
}

/**
 * Fetches the pillar registry from registry-api. Returns the parsed list of
 * `PillarRegistryEntry` values, or a single-element list containing the
 * synthetic `registry` entry on any failure. The shell always has at least
 * one pillar (itself) to reason about.
 */
export async function fetchPillarRegistry(
  options: PillarFetchOptions = {}
): Promise<readonly PillarRegistryEntry[]> {
  try {
    const body = await fetchJson(REGISTRY_URL, options);
    const entries = parseRegistryBody(body);
    if (entries === null) return [SELF_ENTRY];
    return entries.length === 0 ? [SELF_ENTRY] : entries;
  } catch {
    return [SELF_ENTRY];
  }
}

/**
 * Fetches the aggregated pillar health map from registry-api. Returns the
 * parsed map, or an empty object on any failure. The provider treats a
 * missing entry as `'unknown'` so transient probe failures don't paint
 * placeholders over a working UI.
 */
export async function fetchPillarHealth(
  options: PillarFetchOptions = {}
): Promise<Readonly<Record<string, PillarHealthStatus>>> {
  try {
    const body = await fetchJson(HEALTH_URL, options);
    return parseHealthBody(body);
  } catch {
    return {};
  }
}

const SELF_ENTRY: PillarRegistryEntry = { id: REGISTRY_PILLAR_ID, baseUrl: '' };

async function fetchJson(url: string, options: PillarFetchOptions): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: 'GET', signal: controller.signal });
    if (!response.ok) throw new Error(`status ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function parseRegistryBody(body: unknown): readonly PillarRegistryEntry[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const pillars = (body as { pillars?: unknown }).pillars;
  if (!Array.isArray(pillars)) return null;
  const out: PillarRegistryEntry[] = [];
  for (const candidate of pillars) {
    if (typeof candidate !== 'object' || candidate === null) return null;
    const { id, baseUrl } = candidate as { id?: unknown; baseUrl?: unknown };
    if (typeof id !== 'string' || typeof baseUrl !== 'string') return null;
    out.push({ id, baseUrl });
  }
  return out;
}

function parseHealthBody(body: unknown): Readonly<Record<string, PillarHealthStatus>> {
  if (typeof body !== 'object' || body === null) return {};
  const health = (body as { health?: unknown }).health;
  if (typeof health !== 'object' || health === null) return {};
  const out: Record<string, PillarHealthStatus> = {};
  for (const [id, status] of Object.entries(health as Record<string, unknown>)) {
    if (status === 'healthy' || status === 'unavailable') out[id] = status;
  }
  return out;
}
