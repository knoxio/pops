/**
 * Capability-gated, per-pillar settings transport for the admin Settings UI
 * (settings-federation S3; see `docs/plans/02-settings-federation.md` §7.2).
 *
 * The shell renders one settings section per federated pillar and routes each
 * section's read/write to the OWNING pillar's `/<id>-api/settings/*` surface —
 * EXCEPT when the pillar has not yet advertised the live `settings` capability,
 * in which case the transport falls back to `/core-api/settings`. The fallback
 * still works because the federation backfill COPIED (not moved) each pillar's
 * keys into core, so core holds the values until the rollout completes (the
 * compat-shim removal is the later S5 node).
 *
 * This is a HAND-WRITTEN raw-`fetch` client, NOT a generated hey-api client,
 * precisely so it can be keyed dynamically by `ownerPillar` at runtime. It
 * mirrors the wire bytes of every pillar's federated surface (`get-many`,
 * `set-many`, `reset`) and validates responses defensively before handing them
 * to the renderer.
 */

/** A single setting entry on the federated wire. */
export interface SettingEntry {
  readonly key: string;
  readonly value: string;
}

/** The `{ settings: Record<key, value> }` shape `get-many` / `set-many` return. */
export interface SettingsBulkResponse {
  readonly settings: Record<string, string>;
}

/** The `{ reset, settings }` shape `reset` returns. */
export interface SettingsResetResponse {
  readonly reset: readonly string[];
  readonly settings: Record<string, string>;
}

export interface SettingsClient {
  getMany(keys: readonly string[]): Promise<SettingsBulkResponse>;
  setMany(entries: readonly SettingEntry[]): Promise<SettingsBulkResponse>;
  reset(keys?: readonly string[]): Promise<SettingsResetResponse>;
}

const CORE_BASE = '/core-api';

/**
 * The API base path for a pillar's settings surface. The platform `registry`
 * pillar (formerly `core`) keeps its historic `/core-api` prefix during the
 * core→registry rename window — the shell's generated client and the
 * transitional `/core-api/` nginx block both still serve it; every other
 * pillar is reached at `/<id>-api` through the registry-driven nginx front
 * door (and the dev Vite proxy). The legacy `core` id is still mapped for any
 * un-rebuilt caller that has not yet observed the renamed snapshot.
 */
export function settingsBaseFor(ownerPillar: string): string {
  return ownerPillar === 'registry' || ownerPillar === 'core' ? CORE_BASE : `/${ownerPillar}-api`;
}

class SettingsClientError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status: number | undefined) {
    super(message);
    this.name = 'SettingsClientError';
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') out[key] = raw;
  }
  return out;
}

function parseBulk(body: unknown): SettingsBulkResponse {
  if (!isRecord(body)) return { settings: {} };
  return { settings: asStringRecord(body['settings']) };
}

function parseReset(body: unknown): SettingsResetResponse {
  if (!isRecord(body)) return { reset: [], settings: {} };
  const reset = Array.isArray(body['reset'])
    ? body['reset'].filter((k): k is string => typeof k === 'string')
    : [];
  return { reset, settings: asStringRecord(body['settings']) };
}

async function postJson(url: string, body: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new SettingsClientError(`settings request failed (${response.status})`, response.status);
  }
  return (await response.json()) as unknown;
}

/**
 * Build a settings transport keyed by `ownerPillar`. `hasFederatedSettings` is
 * the live `capabilities.settings` flag from the registry snapshot: when ON the
 * transport targets `/<ownerPillar>-api/settings`; when OFF/absent it falls
 * back to `/core-api/settings` so an un-upgraded pillar's writes still land
 * where the old shell put them.
 */
export function settingsClientFor(
  ownerPillar: string,
  hasFederatedSettings: boolean,
  fetchImpl: typeof fetch = fetch
): SettingsClient {
  const base = settingsBaseFor(hasFederatedSettings ? ownerPillar : 'registry');
  return {
    getMany: async (keys) =>
      parseBulk(await postJson(`${base}/settings/get-many`, { keys: [...keys] }, fetchImpl)),
    setMany: async (entries) =>
      parseBulk(await postJson(`${base}/settings/set-many`, { entries: [...entries] }, fetchImpl)),
    reset: async (keys) =>
      parseReset(
        await postJson(
          `${base}/settings/reset`,
          keys === undefined ? {} : { keys: [...keys] },
          fetchImpl
        )
      ),
  };
}
