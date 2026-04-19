/**
 * useSearchKeyboardNav — keyboard navigation for search results.
 *
 * Handles ArrowUp/Down to move selection, Enter to select,
 * Escape to close, and auto-scrolls selected items into view.
 */
import { type RefObject, useCallback, useEffect, useState } from 'react';

type KeyAction =
  | { type: 'next'; index: number }
  | { type: 'select'; index: number }
  | { type: 'close' };

function resolveKeyAction(
  key: string,
  resultCount: number,
  selectedIndex: number
): KeyAction | null {
  if (key === 'Escape') return { type: 'close' };
  if (resultCount === 0) return null;
  if (key === 'ArrowDown') {
    return { type: 'next', index: selectedIndex < resultCount - 1 ? selectedIndex + 1 : 0 };
  }
  if (key === 'ArrowUp') {
    return { type: 'next', index: selectedIndex > 0 ? selectedIndex - 1 : resultCount - 1 };
  }
  if (key === 'Enter' && selectedIndex >= 0) {
    return { type: 'select', index: selectedIndex };
  }
  return null;
}

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
      const action = resolveKeyAction(event.key, resultCount, selectedIndex);
      if (!action) return;
      event.preventDefault();
      switch (action.type) {
        case 'next':
          setSelectedIndex(action.index);
          break;
        case 'select':
          onSelect(action.index);
          break;
        case 'close':
          onClose();
          break;
      }
    },
    [resultCount, selectedIndex, onSelect, onClose]
  );

  // Attach keyboard listener to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, handleKeyDown]);

  return { selectedIndex, setSelectedIndex } as const;
}
