/**
 * Cook-now integration helpers for `RecipeDetailPage`.
 *
 * Mirrors `use-send-flow.ts`: open/close state, a "can cook this version"
 * decider, and a builder that wires both into the action menu's
 * `extraItems` slot (between Drafts and Send-to-list).
 *
 * Canonical menu order:
 *   Edit / Drafts / Cook now... / Send to shopping list... / Archive
 */
import { useCallback, useState } from 'react';

import type { RecipeActionMenuItem } from './RecipeActionMenu.js';
import type { useRecipeDetailData } from './useRecipeDetailData.js';

export interface CookFlow {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export function useCookFlow(): CookFlow {
  const [isOpen, setOpen] = useState(false);
  return {
    isOpen,
    open: useCallback(() => setOpen(true), []),
    close: useCallback(() => setOpen(false), []),
  };
}

export type CanCookResult = { ok: true } | { ok: false; reason: 'NotCompiled' };

export function canCookRecipe(
  data: NonNullable<ReturnType<typeof useRecipeDetailData>['data']>
): CanCookResult {
  if (data.version.compileStatus !== 'compiled') return { ok: false, reason: 'NotCompiled' };
  return { ok: true };
}

interface CookMenuItemArgs {
  label: string;
  canCook: CanCookResult;
  onSelect: () => void;
}

export function buildCookMenuItem({
  label,
  canCook,
  onSelect,
}: CookMenuItemArgs): RecipeActionMenuItem {
  return {
    label,
    value: 'cook-now',
    disabled: !canCook.ok,
    onSelect: canCook.ok ? onSelect : undefined,
  };
}
