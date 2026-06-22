import type { CapabilityStatuses } from '../bootstrap/transport.js';
import type { ManifestPayload } from '../manifest-schema/index.js';

/**
 * One pillar's runtime registration as observed by the discovery client.
 *
 * Mirrors {@link RegistrySnapshot} entries but adds the discovery-side
 * `registered` flag (false during PRD-162 reconciliation windows) and
 * normalises `lastSeenAt` from ISO string to Date.
 */
export type PillarStatus = 'healthy' | 'unavailable' | 'unknown';

export type PillarSnapshot = {
  pillarId: string;
  baseUrl: string;
  manifest: ManifestPayload;
  registered: boolean;
  lastSeenAt: Date;
  /**
   * Liveness flag emitted by the core registry (PRD-161).
   *
   * - `'healthy'`: registry got a successful healthcheck within its window.
   * - `'unavailable'`: registry observed at least one failed healthcheck and
   *   has not recovered. Consumers building tool lists or routing AI calls
   *   should treat these pillars as down.
   * - `'unknown'`: the registry has not yet probed this pillar (cold-start
   *   window). Conservative consumers treat this as down too.
   *
   * Optional because legacy snapshots / tests may omit it.
   */
  status?: PillarStatus;
  /**
   * Live capability statuses the pillar self-reported on register /
   * heartbeat (`<capabilityKey> → up/down`), passed through from the
   * registry wire. Consumers gate features and the federated-settings
   * cutover on these (settings-federation GAP-256-D). Optional because a
   * pillar with no capabilities omits it and legacy snapshots / tests may
   * not carry it.
   */
  capabilities?: CapabilityStatuses;
};

/**
 * The full registry view returned by {@link pillarRegistry}.
 *
 * `source` flags where the data came from:
 *  - `'fresh'`: just fetched from the registry on this call.
 *  - `'cached'`: in-TTL cache hit; no network was performed.
 *  - `'stale-fallback'`: cache is past its TTL and the most recent refresh
 *    failed, so we are serving the last-known-good snapshot. Consumers
 *    that gate writes should respect this signal.
 */
export type RegistrySnapshot = {
  pillars: PillarSnapshot[];
  fetchedAt: Date;
  ttlMs: number;
  source: 'fresh' | 'cached' | 'stale-fallback';
};

/**
 * Thrown by {@link lookupPillar}/{@link pillarRegistry} only when the
 * cache is empty AND the registry can't be reached. If anything is
 * cached (even stale), that is returned in preference to throwing.
 */
export class RegistryUnreachableError extends Error {
  override readonly name = 'RegistryUnreachableError';
  readonly attempts: number;
  override readonly cause?: unknown;

  constructor(message: string, options: { attempts: number; cause?: unknown }) {
    super(message);
    this.attempts = options.attempts;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
