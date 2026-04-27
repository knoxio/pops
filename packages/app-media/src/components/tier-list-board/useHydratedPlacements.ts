import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import { TIERS, type TierPlacements } from './types';

/**
 * Stable equality check for two `TierPlacements` records — compares each
 * tier's id list as a set so re-fetched data with the same content but a
 * different array reference does not blow away in-flight user edits.
 */
function placementsEqual(a: TierPlacements, b: TierPlacements): boolean {
  for (const tier of TIERS) {
    if (a[tier].length !== b[tier].length) return false;
    const set = new Set(a[tier]);
    for (const id of b[tier]) {
      if (!set.has(id)) return false;
    }
  }
  return true;
}

/**
 * Re-sync local board state when the hydrated payload changes (#2195) —
 * dimension switch, post-submit invalidation refetch, etc. The set-based
 * equality check means a reference-only change with identical contents is
 * a no-op, so a mid-drag user edit isn't clobbered by a refetch.
 */
export function useHydratedPlacements(
  initialPlacements: TierPlacements | undefined,
  setPlacements: Dispatch<SetStateAction<TierPlacements>>
): void {
  const lastHydratedRef = useRef<TierPlacements | null>(null);
  useEffect(() => {
    if (!initialPlacements) return;
    if (lastHydratedRef.current && placementsEqual(lastHydratedRef.current, initialPlacements)) {
      return;
    }
    lastHydratedRef.current = initialPlacements;
    setPlacements(initialPlacements);
  }, [initialPlacements, setPlacements]);
}
