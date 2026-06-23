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
 * Parsing/normalisation is shared with the boot install-set resolver via
 * `./registry-snapshot-fetch` so the shell has exactly one registry client.
 * This helper keeps the legacy `/core-api/registry/pillars` URL (an nginx
 * alias proxying to the same registry-api upstream as the canonical
 * `/registry-api/...` route) for wire-compat with deployed Settings bundles.
 *
 * Failures are soft: a fetch error, wrong shape, or empty list yields `[]`, so
 * the page falls back to its empty state rather than throwing.
 */
import { parseSnapshotBody } from './registry-snapshot-fetch';

import type { PillarSnapshot } from '@pops/pillar-sdk';

const SNAPSHOT_URL = '/core-api/registry/pillars';
const DEFAULT_TIMEOUT_MS = 3000;

export interface SettingsSnapshotOptions {
  /** Override the global `fetch` (tests inject a stub). */
  readonly fetch?: typeof fetch;
  /** Per-fetch timeout in milliseconds. Defaults to 3000. */
  readonly timeoutMs?: number;
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
