import { useCallback, useState, type TouchEvent } from 'react';

/**
 * Lightweight swipe-left-to-reveal-delete state for touch devices. Swipe
 * does NOT trigger deletion on its own — single-stroke gestures don't
 * delete, to prevent accidents; the user has to explicitly tap the
 * revealed Delete button.
 *
 * Threshold + axis-lock match the conventions Android Material List rows
 * use: reveal only on a primarily-horizontal left drag past
 * `SWIPE_THRESHOLD_PX`. Vertical scrolls are ignored so the page still
 * scrolls through the list normally.
 */
export interface SwipeDeleteState {
  isOpen: boolean;
  reset: () => void;
  onTouchStart: (e: TouchEvent<HTMLElement>) => void;
  onTouchMove: (e: TouchEvent<HTMLElement>) => void;
  onTouchEnd: () => void;
}

const SWIPE_THRESHOLD_PX = 48;

export function useSwipeDelete(): SwipeDeleteState {
  const [isOpen, setOpen] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [axisLocked, setAxisLocked] = useState<'x' | 'y' | null>(null);

  const reset = useCallback(() => {
    setOpen(false);
    setStart(null);
    setAxisLocked(null);
  }, []);

  const onTouchStart = useCallback((e: TouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (touch === undefined) return;
    setStart({ x: touch.clientX, y: touch.clientY });
    setAxisLocked(null);
  }, []);

  const onTouchMove = useCallback(
    (e: TouchEvent<HTMLElement>) => {
      if (start === null) return;
      const touch = e.touches[0];
      if (touch === undefined) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (axisLocked === null && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
        setAxisLocked(Math.abs(dx) > Math.abs(dy) ? 'x' : 'y');
      }
      if (axisLocked === 'x' && dx <= -SWIPE_THRESHOLD_PX) setOpen(true);
      if (axisLocked === 'x' && dx >= 0) setOpen(false);
    },
    [axisLocked, start]
  );

  const onTouchEnd = useCallback(() => {
    setStart(null);
    setAxisLocked(null);
  }, []);

  return { isOpen, reset, onTouchStart, onTouchMove, onTouchEnd };
}
