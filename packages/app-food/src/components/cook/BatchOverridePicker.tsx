/**
 * Scaffold for PRD-146's batch picker — used inside `ShortfallRow` when
 * the user chooses `batch-override` or `partial`. Queries
 * `food.batches.searchForConsume` once wired.
 */
import type { ReactNode } from 'react';

import type { BatchForConsumeRow } from '@pops/app-food-db';

export interface BatchOverridePickerProps {
  ingredientId?: number;
  variantId?: number;
  onSelect: (batch: BatchForConsumeRow) => void;
  onCancel: () => void;
}

export function BatchOverridePicker(_props: BatchOverridePickerProps): ReactNode {
  return null;
}
