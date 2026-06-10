/**
 * Scaffold for PRD-147's batch-row card inside the sectioned fridge
 * list. Clicking opens `EditBatchModal`; long-press / right-click
 * surfaces the relocate / adjust / delete actions.
 */
import type { ReactNode } from 'react';

import type { FridgeBatchRow as FridgeBatchRowData } from '@pops/app-food-db';

export interface BatchRowProps {
  batch: FridgeBatchRowData;
  onEdit: (batchId: number) => void;
}

export function BatchRow(_props: BatchRowProps): ReactNode {
  return null;
}
