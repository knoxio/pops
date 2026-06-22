/**
 * Browser-side live-registry snapshot fetch for the admin Settings UI
 * (settings-federation S3 / GAP-256-C; see `docs/plans/02-settings-federation.md`).
 *
 * The Settings page renders per-pillar settings sections and routes each
 * section's read/write to the OWNING pillar — both driven by the LIVE registry
 * rather than the build-time `MODULES` projection. This helper fetches the full
 * registry snapshot (which carries each pillar's `manifest.settings.manifests`
 * AND its live `capabilities`) and normalises it into the `PillarSnapshot[]`
 * shape `discoverSettings` consumes.
 *
 * The minimal `GET /pillars` boot projection only carries `{ id, baseUrl }`, so
 * it cannot drive settings discovery; this reads the full snapshot at
 * `GET /core-api/registry/pillars` (proxied to core's `/registry/pillars`),
 * which is the same wire `@pops/pillar-sdk`'s discovery transport reads.
 *
 * Failures are soft: a fetch error, wrong shape, or empty list yields `[]`, so
 * the page falls back to its empty state rather than throwing.
 */
import { ManifestPayloadSchema } from '@pops/pillar-sdk';

import type { CapabilityStatuses, PillarSnapshot } from '@pops/pillar-sdk';

const SNAPSHOT_URL = '/core-api/registry/pillars';
const DEFAULT_TIMEOUT_MS = 3000;

export interface SettingsSnapshotOptions {
  /** Override the global `fetch` (tests inject a stub). */
  readonly fetch?: typeof fetch;
  /** Per-fetch timeout in milliseconds. Defaults to 3000. */
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
 * an entry the settings UI cannot reason about is dropped rather than half-read.
 *
 * Listed entries are treated as `registered: true`: the snapshot only carries
 * live registrations, and the capability gate (not the discovery `registered`
 * flag) decides whether a section's writes route to the pillar or fall back to
 * core.
 */
function normaliseEntry(entry: unknown): PillarSnapshot | null {
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

function parseSnapshotBody(body: unknown): readonly PillarSnapshot[] {
  if (!isRecord(body)) return [];
  const pillars = body['pillars'];
  if (!Array.isArray(pillars)) return [];
  const out: PillarSnapshot[] = [];
  for (const entry of pillars) {
    const normalised = normaliseEntry(entry);
    if (normalised !== null) out.push(normalised);
  }
  return out;
}

/**
 * Fetch the live registry snapshot and normalise it for `discoverSettings`.
 * Returns `[]` on any failure so the Settings page degrades to its empty state.
 */
export async function fetchSettingsSnapshot(
  options: SettingsSnapshotOptions = {}
): Promise<readonly PillarSnapshot[]> {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const response = await fetchImpl(SNAPSHOT_URL, { method: 'GET', signal: controller.signal });
    if (!response.ok) return [];
    return parseSnapshotBody((await response.json()) as unknown);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
