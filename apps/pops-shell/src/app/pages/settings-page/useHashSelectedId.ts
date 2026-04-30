import { useEffect, useState } from 'react';

import type { SettingsManifest } from '@pops/types';

/**
 * Resolves the active settings group from `window.location.hash`. Re-runs when
 * manifests load and on every subsequent `hashchange` (back/forward navigation,
 * address-bar edits, programmatic `window.location.hash = '...'`).
 *
 * Falls back to the first manifest id when the hash is empty or doesn't match
 * any known manifest.
 */
export function useHashSelectedId(manifests: SettingsManifest[]): [string, (id: string) => void] {
  const [selectedId, setSelectedId] = useState<string>(() => window.location.hash.slice(1));

  useEffect(() => {
    if (!manifests.length) return;
    const resolveFromHash = () => {
      const hash = window.location.hash.slice(1);
      const hasValidHash = hash !== '' && manifests.some((m) => m.id === hash);
      setSelectedId(hasValidHash ? hash : (manifests[0]?.id ?? ''));
    };
    resolveFromHash();
    window.addEventListener('hashchange', resolveFromHash);
    return () => window.removeEventListener('hashchange', resolveFromHash);
  }, [manifests]);

  return [selectedId, setSelectedId];
}
