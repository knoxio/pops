/**
 * Scaffold for PRD-143's plan-entry card row. Renders inside the week
 * grid; clicking opens `PlanEntryEditSheet`.
 */
import type { ReactNode } from 'react';

import type { PlanEntryRow as PlanEntryRowData } from '@pops/app-food-db';

export interface PlanEntryRowProps {
  entry: PlanEntryRowData;
  onEdit: (entryId: number) => void;
}

export function PlanEntryRow(_props: PlanEntryRowProps): ReactNode {
  return null;
}
