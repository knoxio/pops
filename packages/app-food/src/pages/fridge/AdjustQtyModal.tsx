/**
 * Scaffold for PRD-147's adjust-qty modal — record waste / spoilage /
 * corrections. Calls `food.batches.adjustQty`.
 */
import type { ReactNode } from 'react';

export interface AdjustQtyModalProps {
  batchId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AdjustQtyModal(_props: AdjustQtyModalProps): ReactNode {
  return null;
}
