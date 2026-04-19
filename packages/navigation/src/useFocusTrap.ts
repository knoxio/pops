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

/**
 * Decide which element (if any) should receive focus to keep the trap closed.
 *
 * Returns `null` when the native Tab behaviour should be allowed to proceed
 * (i.e. focus stays inside the container without wrapping).
 */
function resolveWrapTarget(
  focusable: HTMLElement[],
  currentFocus: HTMLElement | null,
  shiftKey: boolean
): HTMLElement | null {
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return null;

  // Focus on/outside the container or on an element not in the computed
  // focusable list (e.g. tabindex="-1" child) is treated as a boundary and
  // wraps unconditionally.
  const focusIndex = currentFocus ? focusable.indexOf(currentFocus) : -1;

  if (shiftKey) {
    return !currentFocus || focusIndex <= 0 ? last : null;
  }
  return !currentFocus || focusIndex === -1 || focusIndex === focusable.length - 1 ? first : null;
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

      const currentFocus = document.activeElement as HTMLElement | null;
      const target = resolveWrapTarget(focusable, currentFocus, event.shiftKey);
      if (!target) return;

      event.preventDefault();
      target.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, containerRef]);
}
