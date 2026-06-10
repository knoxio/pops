/**
 * Scaffold for PRD-147's "+ Add batch" modal — manual-entry path.
 * Calls `food.batches.create` once wired.
 */
import type { ReactNode } from 'react';

export interface AddBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded?: (batchId: number) => void;
}

export function AddBatchModal(_props: AddBatchModalProps): ReactNode {
  return null;
}
