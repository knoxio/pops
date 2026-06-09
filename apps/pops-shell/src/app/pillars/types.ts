/**
 * Shell-side pillar boot types (ADR-026 P3).
 */
import type { PillarRegistryEntry } from '@pops/types';

/**
 * Shell-side health view for a pillar:
 *   - `'healthy'`     — the aggregated `/pillars/health` probe returned healthy.
 *   - `'unavailable'` — the probe returned unavailable; routes for this pillar
 *                       render `PillarUnavailableRoute`.
 *   - `'unknown'`     — boot fetch hasn't completed (or failed outright); the
 *                       UI optimistically renders module routes rather than
 *                       flashing placeholders for the duration of a slow boot.
 */
export type PillarHealthStatus = 'healthy' | 'unavailable' | 'unknown';

/** Snapshot returned by the shell-side registry + health fetch. */
export interface PillarBootSnapshot {
  readonly entries: readonly PillarRegistryEntry[];
  readonly health: Readonly<Record<string, PillarHealthStatus>>;
}

/** Live state exposed by `PillarStatusProvider` via React context. */
export interface PillarStatusContextValue {
  readonly snapshot: PillarBootSnapshot;
  readonly loading: boolean;
  readonly refresh: () => Promise<void>;
}
