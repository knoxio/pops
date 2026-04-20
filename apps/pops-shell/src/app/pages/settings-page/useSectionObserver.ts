import { useEffect, useState } from 'react';

import type { SettingsManifest } from '@pops/types';

export function useSectionObserver(manifests: SettingsManifest[]) {
  const [activeId, setActiveId] = useState<string>('');

  // Initialize from URL hash or first section — guarded so a tRPC refetch
  // (focus/reconnect) doesn't reset the active section after the user scrolls.
  useEffect(() => {
    if (!manifests.length) return;
    const hash = window.location.hash.slice(1);
    const hasValidHash = hash !== '' && manifests.some((m) => m.id === hash);
    const initialId = hasValidHash ? hash : (manifests[0]?.id ?? '');
    if (!initialId) return;
    if (activeId && (!hasValidHash || activeId === hash)) return;
    setActiveId(initialId);
  }, [activeId, manifests]);

  useEffect(() => {
    if (!manifests.length) return;
    // Must match aside sticky offset (top-20 = 5rem = 80px) and section scroll-mt-20
    const HEADER_OFFSET = 80;
    // Cache elements once so the scroll handler avoids repeated DOM queries
    const elements = manifests.map((m) => document.getElementById(m.id));
    let rafId: number | null = null;
    const update = () => {
      let current = manifests[0]?.id ?? '';
      for (let i = 0; i < manifests.length; i++) {
        const el = elements[i];
        if (!el) continue;
        if (el.getBoundingClientRect().top <= HEADER_OFFSET) current = manifests[i]!.id;
      }
      setActiveId(current);
      rafId = null;
    };
    const onScroll = () => {
      if (rafId === null) rafId = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [manifests]);

  return activeId;
}
