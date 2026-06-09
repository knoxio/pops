/**
 * Hooks for consuming the pillar boot snapshot (ADR-026 P3).
 */
import { useContext } from 'react';

import { PillarStatusContext } from './PillarStatusProvider';

import type { PillarHealthStatus, PillarStatusContextValue } from './types';

/**
 * Returns the full boot context. Throws if used outside a
 * `PillarStatusProvider` — the provider is mounted in `App.tsx` and is
 * expected to wrap every route.
 */
export function usePillarStatusContext(): PillarStatusContextValue {
  const ctx = useContext(PillarStatusContext);
  if (ctx === null) {
    throw new Error('usePillarStatusContext must be used inside <PillarStatusProvider>');
  }
  return ctx;
}

/**
 * Returns the health status for a single pillar id. Pillars that are
 * not present in the boot snapshot (the registry didn't include them,
 * or the boot is still in flight) report `'unknown'` — which the
 * `PillarGuard` component treats as healthy so a slow / failed boot
 * does not flash a placeholder over working routes.
 */
export function usePillarStatus(pillarId: string): PillarHealthStatus {
  const { snapshot } = usePillarStatusContext();
  return snapshot.health[pillarId] ?? 'unknown';
}
