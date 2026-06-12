import type { ManifestPayload } from '../manifest-schema/index.js';

/**
 * One pillar's runtime registration as observed by the discovery client.
 *
 * Mirrors {@link RegistrySnapshot} entries but adds the discovery-side
 * `registered` flag (false during PRD-162 reconciliation windows) and
 * normalises `lastSeenAt` from ISO string to Date.
 */
export type PillarSnapshot = {
  pillarId: string;
  baseUrl: string;
  manifest: ManifestPayload;
  registered: boolean;
  lastSeenAt: Date;
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
