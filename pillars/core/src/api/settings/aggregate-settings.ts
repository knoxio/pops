/**
 * Settings aggregator fan-out (settings-federation S3, OD-7; see
 * `docs/plans/02-settings-federation.md` §4.5).
 *
 * Builds the unified admin settings view by fanning out over the live
 * registry to each pillar's federated `GET /settings` collection. The
 * `core` self-entry is read IN-PROCESS (the aggregator runs inside core's
 * process), every other registered pillar is read over the docker network
 * at `${baseUrl}/settings`.
 *
 * Auth (OD-7). The PUBLIC `GET /settings/aggregate` route is identity-gated
 * by the caller (`core.settings.aggregate`). This in-cluster fan-out carries
 * the shared internal token (`x-pops-internal-token: POPS_API_INTERNAL_TOKEN`)
 * so a pillar that gates its collection read on the internal-token alias (the
 * food pattern) still answers; pillars that trust the docker network ignore
 * the header. The aggregator therefore never depends on a browser session it
 * cannot forward.
 *
 * Redaction (R12 / GAP-256-E). Each pillar already redacts its own sensitive
 * fields in its `list` handler, but the aggregator re-redacts DEFENSIVELY
 * using the sensitive-key set derived from each pillar's own manifest in the
 * snapshot — a misbehaving or downgraded pillar can never leak a `plex_token`
 * or encryption seed through the aggregate sweep.
 *
 * Degradation. An unreachable pillar, a non-200, a parse failure, or a 401/403
 * contributes `{ pillarId, settings: [], error }` rather than failing the
 * whole call — one slow pillar never blanks the admin page.
 */
import { deriveKeySet, redactSensitive } from '@pops/pillar-settings';

import type { ManifestPayload } from '@pops/pillar-sdk';
import type { SettingRow } from '@pops/pillar-settings';

/** A single setting row on the aggregate wire. */
export interface AggregateSettingRow {
  readonly key: string;
  readonly value: string;
}

/** Why a pillar contributed no rows, when it didn't. */
export type AggregatePillarError = 'unreachable' | 'unauthorized';

/** One pillar's slice of the unified admin settings view. */
export interface AggregatePillarSettings {
  readonly pillarId: string;
  readonly settings: AggregateSettingRow[];
  readonly error?: AggregatePillarError;
}

/** The aggregate response body. */
export interface SettingsAggregate {
  readonly pillars: AggregatePillarSettings[];
  readonly fetchedAt: string;
}

/** One registry entry the aggregator fans out over. */
export interface AggregateTarget {
  readonly pillarId: string;
  readonly baseUrl: string;
  readonly manifest: ManifestPayload;
  readonly capabilities?: Readonly<Record<string, boolean>>;
}

export interface AggregateSettingsOptions {
  /** The self-pillar id read in-process rather than over HTTP. Defaults to `core`. */
  readonly selfPillarId?: string;
  /** Reads the self-pillar's effective, already-redacted rows in-process. */
  readonly readSelf: () => readonly SettingRow[];
  /** Shared internal token presented on the in-cluster fan-out. */
  readonly internalToken?: string;
  /** Per-probe timeout in ms. Defaults to 2500. */
  readonly timeoutMs?: number;
  /** Override the global `fetch` (tests inject a stub). */
  readonly fetch?: typeof fetch;
  /** Clock injection for `fetchedAt`. Defaults to `Date`. */
  readonly now?: () => Date;
}

const DEFAULT_SELF_PILLAR_ID = 'core';
const DEFAULT_TIMEOUT_MS = 2500;
const INTERNAL_TOKEN_HEADER = 'x-pops-internal-token';

/** Sensitive-key set declared by a pillar's own settings manifests. */
function sensitiveKeysOf(manifest: ManifestPayload): Set<string> {
  const manifests = manifest.settings?.manifests;
  if (manifests === undefined || manifests.length === 0) return new Set();
  return new Set(deriveKeySet(manifests).sensitive);
}

/**
 * Parse a pillar's `GET /settings` collection body
 * (`{ data: { key, value }[] }`) into rows, or `null` on any shape mismatch.
 */
function parseCollectionBody(body: unknown): AggregateSettingRow[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const data: unknown = Reflect.get(body, 'data');
  if (!Array.isArray(data)) return null;
  const rows: AggregateSettingRow[] = [];
  for (const candidate of data) {
    if (typeof candidate !== 'object' || candidate === null) return null;
    const key: unknown = Reflect.get(candidate, 'key');
    const value: unknown = Reflect.get(candidate, 'value');
    if (typeof key !== 'string' || typeof value !== 'string') return null;
    rows.push({ key, value });
  }
  return rows;
}

async function fetchRemoteSettings(
  target: AggregateTarget,
  options: AggregateSettingsOptions
): Promise<AggregatePillarSettings> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const headers: Record<string, string> =
    options.internalToken === undefined ? {} : { [INTERNAL_TOKEN_HEADER]: options.internalToken };
  try {
    const response = await fetchImpl(`${target.baseUrl}/settings`, {
      method: 'GET',
      signal: controller.signal,
      headers,
    });
    if (response.status === 401 || response.status === 403) {
      return { pillarId: target.pillarId, settings: [], error: 'unauthorized' };
    }
    if (!response.ok) {
      return { pillarId: target.pillarId, settings: [], error: 'unreachable' };
    }
    const body: unknown = await response.json();
    const rows = parseCollectionBody(body);
    if (rows === null) {
      return { pillarId: target.pillarId, settings: [], error: 'unreachable' };
    }
    return {
      pillarId: target.pillarId,
      settings: redactSensitive(rows, sensitiveKeysOf(target.manifest)),
    };
  } catch {
    return { pillarId: target.pillarId, settings: [], error: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

/** True when a target advertises a live `settings` capability. */
export function hasFederatedSettings(target: AggregateTarget): boolean {
  return target.capabilities?.['settings'] === true;
}

/**
 * Fan out over the registry and build the unified admin settings view.
 *
 * The self-pillar is read in-process (already redacted by its own `list`
 * service). Every OTHER registered target that advertises the `settings`
 * capability is fetched over the docker network and re-redacted defensively.
 * A target that has not advertised the capability is skipped — its settings
 * still live on core until it rolls to its federated image, and core is the
 * self-entry, so nothing is lost.
 */
export async function aggregateSettings(
  targets: readonly AggregateTarget[],
  options: AggregateSettingsOptions
): Promise<SettingsAggregate> {
  const selfPillarId = options.selfPillarId ?? DEFAULT_SELF_PILLAR_ID;
  const now = options.now ?? (() => new Date());

  const probes = targets
    .filter((target) => target.pillarId !== selfPillarId && hasFederatedSettings(target))
    .map((target) => fetchRemoteSettings(target, options));

  const self: AggregatePillarSettings = {
    pillarId: selfPillarId,
    settings: [...options.readSelf()],
  };

  const remote = await Promise.all(probes);
  return {
    pillars: [self, ...remote].toSorted((a, b) => a.pillarId.localeCompare(b.pillarId)),
    fetchedAt: now().toISOString(),
  };
}
