import { type RefObject, useCallback, useEffect } from 'react';

export function usePanelDismiss(
  panelRef: RefObject<HTMLDivElement | null>,
  onClose: () => void
): void {
  const handleOutsideClick = useCallback(
    (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose, panelRef]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleOutsideClick, handleKeyDown]);
}

export function sortSections<T extends { hits: { score: number }[]; isContext: boolean }>(
  sections: T[]
): T[] {
  return [...sections]
    .filter((s) => s.hits.length > 0)
    .toSorted((a, b) => {
      if (a.isContext && !b.isContext) return -1;
      if (!a.isContext && b.isContext) return 1;
      const aMax = Math.max(...a.hits.map((h) => h.score));
      const bMax = Math.max(...b.hits.map((h) => h.score));
      return bMax - aMax;
    });
}
