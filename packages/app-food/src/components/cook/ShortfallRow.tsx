/**
 * Scaffold for PRD-146's single shortfall row. Owned by the parent
 * `ShortfallList`; offers the three resolution options
 * (`batch-override`, `external`, `partial`) on a single line.
 */
import type { ReactNode } from 'react';

import type { LineResolution, Shortfall } from '@pops/app-food-db';

export interface ShortfallRowProps {
  lineIndex: number;
  shortfall: Shortfall;
  resolution: LineResolution | undefined;
  onResolve: (resolution: LineResolution) => void;
}

export function ShortfallRow(_props: ShortfallRowProps): ReactNode {
  return null;
}
