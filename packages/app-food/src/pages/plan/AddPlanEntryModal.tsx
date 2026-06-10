/**
 * Scaffold for PRD-143's add-entry modal. Opened from a "+" affordance
 * on each plan-week cell; calls `food.plan.addEntry` once wired.
 */
import type { ReactNode } from 'react';

export interface AddPlanEntryModalProps {
  date: string;
  slot: string;
  isOpen: boolean;
  onClose: () => void;
  onAdded?: (entryId: number) => void;
}

export function AddPlanEntryModal(_props: AddPlanEntryModalProps): ReactNode {
  return null;
}
