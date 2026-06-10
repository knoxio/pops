/**
 * Scaffold for PRD-147's edit-batch modal. Edits expiry / notes /
 * prep-state. Calls `food.batches.edit` once wired.
 */
import type { ReactNode } from 'react';

export interface EditBatchModalProps {
  batchId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditBatchModal(_props: EditBatchModalProps): ReactNode {
  return null;
}
