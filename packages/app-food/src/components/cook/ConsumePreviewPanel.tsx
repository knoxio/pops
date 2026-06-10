/**
 * Scaffold for PRD-146's consume-preview panel — embeds inside
 * PRD-144's `CookModal`. Reads resolved lines from `useCookResolution`
 * and renders the per-line resolution outcomes.
 */
import type { ReactNode } from 'react';

import type { ConsumptionNeed, LineResolution } from '@pops/app-food-db';

export interface ConsumePreviewPanelProps {
  consumeNeeds: readonly ConsumptionNeed[];
  scaleFactor: number;
  resolutionMap: ReadonlyMap<number, LineResolution>;
}

export function ConsumePreviewPanel(_props: ConsumePreviewPanelProps): ReactNode {
  return null;
}
