/**
 * Scaffold for PRD-146's resolution-state hook. Returns an empty
 * resolution map until the real implementation lands. PRD-146 fills in
 * the FIFO-default seeding + shortfall reconciliation.
 */
import { useMemo } from 'react';

import type { ConsumptionNeed, LineResolution, Shortfall } from '@pops/app-food-db';

export interface UseCookResolutionArgs {
  consumeNeeds: readonly ConsumptionNeed[];
  scaleFactor: number;
  shortfalls: readonly Shortfall[];
}

export interface UseCookResolutionResult {
  resolutionMap: ReadonlyMap<number, LineResolution>;
  unresolvedCount: number;
  setResolution: (lineIndex: number, resolution: LineResolution) => void;
}

export function useCookResolution(_args: UseCookResolutionArgs): UseCookResolutionResult {
  return useMemo<UseCookResolutionResult>(
    () => ({
      resolutionMap: new Map<number, LineResolution>(),
      unresolvedCount: 0,
      setResolution: () => {},
    }),
    []
  );
}
