/**
 * React context + provider for the shell-side pillar boot snapshot
 * (ADR-026 P3).
 *
 * The provider fetches the pillar registry and aggregated health map at
 * mount and exposes them via context. Routes consult the snapshot via
 * `usePillarStatus(pillarId)` (see ./usePillarStatus.ts) and render
 * `PillarUnavailableRoute` when the owning pillar is marked
 * `'unavailable'`.
 *
 * While the boot fetch is in flight, every pillar is reported as
 * `'unknown'` and treated by `PillarGuard` as healthy — slow boots must
 * not flash placeholders over working routes.
 */
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchPillarHealth, fetchPillarRegistry } from './pillar-registry-client';

import type { PillarBootSnapshot, PillarStatusContextValue } from './types';

const EMPTY_SNAPSHOT: PillarBootSnapshot = { entries: [], health: {} };

const PillarStatusContext = createContext<PillarStatusContextValue | null>(null);

export { PillarStatusContext };

interface PillarStatusProviderProps {
  readonly children: React.ReactNode;
  /**
   * Test-only override that skips the boot fetch and seeds the snapshot
   * directly. Production callers must not pass this.
   */
  readonly snapshot?: PillarBootSnapshot;
}

/**
 * Top-level provider mounted in `App.tsx`. Owns a single boot fetch and
 * exposes the resulting snapshot to every consumer.
 *
 * When a test passes `snapshot`, the provider skips the network call and
 * renders the supplied state synchronously. The override is intended for
 * RTL tests of consuming components.
 */
export function PillarStatusProvider({
  children,
  snapshot,
}: PillarStatusProviderProps): React.ReactElement {
  const [state, setState] = useState<PillarBootSnapshot>(snapshot ?? EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(snapshot === undefined);
  // Track the latest fetch so a stale refresh doesn't overwrite a newer one.
  const fetchTokenRef = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++fetchTokenRef.current;
    setLoading(true);
    try {
      const [entries, health] = await Promise.all([fetchPillarRegistry(), fetchPillarHealth()]);
      if (fetchTokenRef.current !== token) return;
      setState({ entries, health });
    } finally {
      if (fetchTokenRef.current === token) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (snapshot !== undefined) return;
    void refresh();
  }, [refresh, snapshot]);

  const value = useMemo<PillarStatusContextValue>(
    () => ({ snapshot: state, loading, refresh }),
    [state, loading, refresh]
  );

  return <PillarStatusContext.Provider value={value}>{children}</PillarStatusContext.Provider>;
}
