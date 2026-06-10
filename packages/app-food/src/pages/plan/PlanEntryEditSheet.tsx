/**
 * Scaffold for PRD-143's plan-entry edit sheet — bottom-sheet on
 * mobile, side-sheet on desktop. Hosts the "Mark cooked" button that
 * opens PRD-144's `CookModal` with `planEntryId` pre-populated.
 */
import type { ReactNode } from 'react';

export interface PlanEntryEditSheetProps {
  entryId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PlanEntryEditSheet(_props: PlanEntryEditSheetProps): ReactNode {
  return null;
}
