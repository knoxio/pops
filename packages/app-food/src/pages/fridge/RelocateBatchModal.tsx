/**
 * Scaffold for PRD-147's relocate modal — moves a batch between
 * pantry / fridge / freezer / other. Calls `food.batches.relocate`.
 */
import type { ReactNode } from 'react';

export interface RelocateBatchModalProps {
  batchId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function RelocateBatchModal(_props: RelocateBatchModalProps): ReactNode {
  return null;
}
