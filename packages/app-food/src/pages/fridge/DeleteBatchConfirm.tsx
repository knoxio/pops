/**
 * Scaffold for PRD-147's soft-delete confirm dialog. Calls
 * `food.batches.delete` (soft-delete via `deleted_at`, set by PRD-145).
 */
import type { ReactNode } from 'react';

export interface DeleteBatchConfirmProps {
  batchId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmed?: () => void;
}

export function DeleteBatchConfirm(_props: DeleteBatchConfirmProps): ReactNode {
  return null;
}
