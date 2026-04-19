import { useEffect, useState } from 'react';

import type { SettingsManifest } from '@pops/types';

export function useSectionObserver(
  manifests: SettingsManifest[],
  contentRef: React.RefObject<HTMLDivElement | null>
) {
  const [activeId, setActiveId] = useState<string>('');

  // Default to first manifest when data loads and no section is active yet
  useEffect(() => {
    if (manifests.length > 0 && !activeId) {
      const hash = window.location.hash.slice(1);
      setActiveId(hash && manifests.some((m) => m.id === hash) ? hash : (manifests[0]?.id ?? ''));
    }
  }, [manifests, activeId]);

  useEffect(() => {
    if (!manifests.length || !contentRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0 && visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { root: null, rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    );

    for (const m of manifests) {
      const el = document.getElementById(m.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [manifests, contentRef]);

  return activeId;
}
