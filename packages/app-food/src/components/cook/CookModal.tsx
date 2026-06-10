/**
 * Scaffold for PRD-144's cook modal.
 *
 * Returns `null` until PRD-144 wires the real shell (scale / yield /
 * rating / notes fields + embedded PRD-146 panels). The `extraItems`
 * slot on `RecipeActionMenu` is the canonical entry point; PRD-119-B
 * already exposes it (`packages/app-food/src/pages/recipes/RecipeActionMenu.tsx`).
 */
import type { ReactNode } from 'react';

export interface CookModalProps {
  recipeVersionId: number;
  scaleFactor?: number;
  planEntryId?: number;
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful `food.cook.markCooked`. */
  onCookedSuccess?: (result: { recipeRunId: number; yieldedBatchId: number | null }) => void;
}

export function CookModal(_props: CookModalProps): ReactNode {
  return null;
}
