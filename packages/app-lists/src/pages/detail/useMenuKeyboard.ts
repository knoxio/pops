import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

/**
 * ARIA menu keyboard model for the detail / item three-dot menus.
 *
 * Implements the subset of WAI-ARIA `role="menu"` keyboard behaviour the page
 * needs: arrow up/down cycle through the `role="menuitem"` children, Home/End
 * jump to first/last, focus lands on the first item when the menu opens. Tab
 * is allowed to pass through (closing the menu by losing focus is handled by
 * the caller's outside-click listener). Escape close is the caller's
 * responsibility too — we listen for it inside the menu so the focus stays
 * trapped while open.
 */
export interface MenuKeyboard {
  menuRef: React.RefObject<HTMLUListElement | null>;
  onMenuKeyDown: (e: KeyboardEvent<HTMLUListElement>) => void;
}

function menuItems(menu: HTMLUListElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
}

function focusByIndex(menu: HTMLUListElement, target: number): void {
  const items = menuItems(menu);
  if (items.length === 0) return;
  const next = (target + items.length) % items.length;
  items[next]?.focus();
}

export function useMenuKeyboard(open: boolean): MenuKeyboard {
  const menuRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (!open || menuRef.current === null) return;
    // Defer to next frame so children render before we look them up.
    const id = window.requestAnimationFrame(() => {
      if (menuRef.current !== null) focusByIndex(menuRef.current, 0);
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const onMenuKeyDown = useCallback((e: KeyboardEvent<HTMLUListElement>) => {
    const menu = menuRef.current;
    if (menu === null) return;
    const items = menuItems(menu);
    const currentIndex = items.findIndex((el) => el === document.activeElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusByIndex(menu, currentIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusByIndex(menu, currentIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusByIndex(menu, 0);
        break;
      case 'End':
        e.preventDefault();
        focusByIndex(menu, items.length - 1);
        break;
      default:
        break;
    }
  }, []);

  return { menuRef, onMenuKeyDown };
}
