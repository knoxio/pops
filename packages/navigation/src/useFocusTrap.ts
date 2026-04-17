/**
 * useFocusTrap — traps Tab/Shift+Tab focus within a container element.
 *
 * When `active` is true, Tab cycles forward and Shift+Tab cycles backward
 * through all focusable descendants of `containerRef`. Focus never leaves
 * the container while the trap is active.
 *
 * When `active` becomes false the trap is removed — the caller is responsible
 * for restoring focus to an appropriate element if needed.
 */
import { type RefObject, useEffect } from 'react';

/**
 * CSS selector that matches all natively tabbable elements.
 *
 * Intentional exclusions:
 * - `input[type="hidden"]` — not focusable by the browser
 * - `[disabled]` — removed from tab order by the browser
 * - `[tabindex="-1"]` — reachable via script/click but not via Tab key;
 *   the `:not([tabindex="-1"])` guard is applied to every element-level rule
 *   so that an explicit `tabindex="-1"` on a normally-tabbable element (e.g.
 *   a `<button tabindex="-1">`) is also excluded.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]')
  );
}

interface UseFocusTrapOptions {
  /** Ref to the container that should trap focus. */
  containerRef: RefObject<HTMLElement | null>;
  /** Whether the trap is currently active. */
  active: boolean;
}

export function useFocusTrap({ containerRef, active }: UseFocusTrapOptions): void {
  useEffect(() => {
    if (!active) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const currentFocus = document.activeElement as HTMLElement | null;

      // Determine whether the currently focused element is a known tabbable
      // descendant. If focus is outside the container, on the container itself,
      // or on an element not in the computed focusable list (e.g. tabindex="-1"
      // child), we treat it as a boundary and wrap unconditionally.
      const focusIndex = currentFocus ? focusable.indexOf(currentFocus) : -1;

      if (event.shiftKey) {
        // Shift+Tab: wrap to last when focus is on/before first, or not in the list
        if (!currentFocus || focusIndex <= 0) {
          event.preventDefault();
          last.focus();
        }
      } else {
        // Tab: wrap to first when focus is on/after last, or not in the list
        if (!currentFocus || focusIndex === -1 || focusIndex === focusable.length - 1) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, containerRef]);
}
