/**
 * useSearchKeyboardNav — keyboard navigation for search results.
 *
 * Handles ArrowUp/Down to move selection, Enter to select,
 * Escape to close, and auto-scrolls selected items into view.
 */
import { type RefObject, useCallback, useEffect, useState } from 'react';

interface UseSearchKeyboardNavOptions {
  /** Total number of navigable results across all sections. */
  resultCount: number;
  /** Called when Enter is pressed on a selected result. */
  onSelect: (index: number) => void;
  /** Called when Escape is pressed. */
  onClose: () => void;
  /** Ref to the container element that receives keyboard events. */
  containerRef: RefObject<HTMLElement | null>;
  /** Data attribute used to identify result items for scroll-into-view. Default: "data-result-index". */
  itemAttribute?: string;
}

export function useSearchKeyboardNav({
  resultCount,
  onSelect,
  onClose,
  containerRef,
  itemAttribute = 'data-result-index',
}: UseSearchKeyboardNavOptions) {
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [resultCount]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex < 0 || !containerRef.current) return;
    const item = containerRef.current.querySelector(`[${itemAttribute}="${selectedIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, containerRef, itemAttribute]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (resultCount === 0) {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
        return;
      }

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          setSelectedIndex((prev) => (prev < resultCount - 1 ? prev + 1 : 0));
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : resultCount - 1));
          break;
        }
        case 'Enter': {
          event.preventDefault();
          if (selectedIndex >= 0) {
            onSelect(selectedIndex);
          }
          break;
        }
        case 'Escape': {
          event.preventDefault();
          onClose();
          break;
        }
      }
    },
    [resultCount, selectedIndex, onSelect, onClose]
  );

  // Attach keyboard listener to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, handleKeyDown]);

  return { selectedIndex, setSelectedIndex } as const;
}
