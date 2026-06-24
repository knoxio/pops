/**
 * Send-to-list integration helpers for `RecipeDetailPage`.
 *
 * Extracted from the page so the page stays under the per-file lint cap.
 * `useSendFlow` owns the modal open/close state; `canSendRecipe` is the
 * disabled-tooltip decider; `buildSendMenuItem` wires both into the action
 * menu's `extraItems` slot.
 */
import { useCallback, useState } from 'react';

import type { RecipeActionMenuItem } from './RecipeActionMenu.js';
import type { useRecipeDetailData } from './useRecipeDetailData.js';

export interface SendFlow {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export function useSendFlow(): SendFlow {
  const [isOpen, setOpen] = useState(false);
  return {
    isOpen,
    open: useCallback(() => setOpen(true), []),
    close: useCallback(() => setOpen(false), []),
  };
}

export type CanSendResult = { ok: true } | { ok: false; reason: 'NoIngredients' | 'NotCompiled' };

export function canSendRecipe(
  data: NonNullable<ReturnType<typeof useRecipeDetailData>['data']>
): CanSendResult {
  if (data.version.compileStatus !== 'compiled') return { ok: false, reason: 'NotCompiled' };
  if (data.lines.length === 0) return { ok: false, reason: 'NoIngredients' };
  return { ok: true };
}

interface SendMenuItemArgs {
  label: string;
  canSend: CanSendResult;
  onSelect: () => void;
}

export function buildSendMenuItem({
  label,
  canSend,
  onSelect,
}: SendMenuItemArgs): RecipeActionMenuItem {
  return {
    label,
    value: 'send-to-list',
    disabled: !canSend.ok,
    onSelect: canSend.ok ? onSelect : undefined,
  };
}
