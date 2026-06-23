/**
 * Shared browser-side fetcher for the live registry snapshot
 * (`GET /registry-api/registry/pillars`).
 *
 * The full snapshot carries each pillar's `manifest` (nav / pages /
 * assetsBaseUrl / settings) plus its live `capabilities` and registration
 * status. Two shell consumers read it:
 *
 *   - the admin Settings UI (`settings-snapshot.ts`), to route per-pillar
 *     settings reads/writes to the owning pillar;
 *   - the boot install-set resolver (`boot-snapshot.ts`), to decide which
 *     pillars the shell mounts (federation north-star: the registry is the
 *     source of truth, not the build-time `MODULES` constant).
 *
 * Both share this single fetch + parse so the shell has exactly one registry
 * client. The minimal `GET /pillars` boot projection only carries
 * `{ id, baseUrl }` and cannot drive either consumer; this reads the full
 * snapshot. The URL prefers the canonical `/registry-api/...` nginx route
 * (the legacy `/core-api/...` alias proxies to the same upstream).
 *
 * Failures are soft: a fetch error, timeout, non-OK status, wrong shape, or
 * empty list yields `[]`, so each consumer degrades to its own fallback
 * (the Settings page to an empty state; boot to the static bundle-map floor)
 * rather than throwing.
 */
import { ManifestPayloadSchema } from '@pops/pillar-sdk';

import type { CapabilityStatuses, PillarSnapshot } from '@pops/pillar-sdk';

/** Canonical nginx route to the full registry snapshot. */
export const REGISTRY_SNAPSHOT_URL = '/registry-api/registry/pillars';

/** Default per-fetch timeout. The registry is LAN-local (normally <100ms). */
export const DEFAULT_SNAPSHOT_TIMEOUT_MS = 3000;

export interface RegistrySnapshotFetchOptions {
  /** Override the global `fetch` (tests inject a stub). */
  readonly fetch?: typeof fetch;
  /** Per-fetch timeout in milliseconds. Defaults to {@link DEFAULT_SNAPSHOT_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCapabilities(value: unknown): CapabilityStatuses | undefined {
  if (!isRecord(value)) return undefined;
  const out: CapabilityStatuses = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'boolean') out[key] = raw;
  }
  return out;
}

/**
 * Normalise one raw registry-snapshot entry into a `PillarSnapshot`. Returns
 * `null` when the entry lacks a usable `pillarId` or a well-formed manifest —
 * an entry no consumer can reason about is dropped rather than half-read.
 *
 * Listed entries are treated as `registered: true`: the snapshot only carries
 * live registrations.
 */
export function normaliseSnapshotEntry(entry: unknown): PillarSnapshot | null {
  if (!isRecord(entry)) return null;
  const pillarId = entry['pillarId'];
  const baseUrl = entry['baseUrl'];
  if (typeof pillarId !== 'string' || typeof baseUrl !== 'string') return null;

  const manifest = ManifestPayloadSchema.safeParse(entry['manifest']);
  if (!manifest.success) return null;

  const capabilities = parseCapabilities(entry['capabilities']);
  const lastSeenRaw = entry['lastHeartbeatAt'];
  const lastSeenAt = typeof lastSeenRaw === 'string' ? new Date(lastSeenRaw) : new Date(0);

  return {
    pillarId,
    baseUrl,
    manifest: manifest.data,
    registered: true,
    lastSeenAt,
    ...(capabilities !== undefined ? { capabilities } : {}),
  };
}

/** Parse the `{ pillars }` snapshot body, dropping unusable entries. */
export function parseSnapshotBody(body: unknown): readonly PillarSnapshot[] {
  if (!isRecord(body)) return [];
  const pillars = body['pillars'];
  if (!Array.isArray(pillars)) return [];
  const out: PillarSnapshot[] = [];
  for (const entry of pillars) {
    const normalised = normaliseSnapshotEntry(entry);
    if (normalised !== null) out.push(normalised);
  }
  return out;
}

/**
 * Fetch the live registry snapshot and normalise it to `PillarSnapshot[]`.
 * Returns `[]` on any failure (network error, timeout, non-OK status, wrong
 * shape, empty list) so callers degrade to their own fallback rather than
 * throwing.
 */
export async function fetchRegistrySnapshot(
  options: RegistrySnapshotFetchOptions = {}
): Promise<readonly PillarSnapshot[]> {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const response = await fetchImpl(REGISTRY_SNAPSHOT_URL, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) return [];
    return parseSnapshotBody((await response.json()) as unknown);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
