/**
 * Scaffold for PRD-146's shortfall list — embeds inside PRD-144's
 * `CookModal`. Lists every unresolved-need line; gates the Mark-cooked
 * button via the resolution map.
 */
import type { ReactNode } from 'react';

import type { LineResolution, Shortfall } from '@pops/app-food-db';

export interface ShortfallListProps {
  shortfalls: readonly Shortfall[];
  resolutionMap: ReadonlyMap<number, LineResolution>;
  onResolve: (lineIndex: number, resolution: LineResolution) => void;
}

export function ShortfallList(_props: ShortfallListProps): ReactNode {
  return null;
}
