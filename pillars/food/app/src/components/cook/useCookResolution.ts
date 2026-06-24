/**
 * `useCookResolution` — holds the per-line `LineResolution` map for the
 * cook modal. Seeds the map with `kind: 'fifo'` for every line the
 * default FIFO can fully cover; lines with a matching `LineShortfall`
 * start unresolved and the UI prompts the user to pick `batch-override`,
 * `external`, or `partial` before Mark-cooked enables.
 *
 * State is local to the modal session — closing discards it. A
 * `scaleFactor` change resets the entire map because the per-line `qty`
 * inputs change, so prior `consumeQty` selections no longer apply.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LineConsumeNeed, LineResolution, LineShortfall } from './cook-resolution-types.js';

export interface UseCookResolutionArgs {
  lineNeeds: readonly LineConsumeNeed[];
  shortfalls: readonly LineShortfall[];
  scaleFactor: number;
}

export interface UseCookResolutionResult {
  resolutionMap: ReadonlyMap<number, LineResolution>;
  unresolvedShortfallCount: number;
  shortfallsByLine: ReadonlyMap<number, LineShortfall>;
  needsByLine: ReadonlyMap<number, LineConsumeNeed>;
  setResolution: (lineIndex: number, resolution: LineResolution) => void;
  scaleResetSignal: number;
}

function shortfallsByLineMap(
  shortfalls: readonly LineShortfall[]
): ReadonlyMap<number, LineShortfall> {
  const map = new Map<number, LineShortfall>();
  for (const s of shortfalls) map.set(s.lineIndex, s);
  return map;
}

function needsByLineMap(
  lineNeeds: readonly LineConsumeNeed[]
): ReadonlyMap<number, LineConsumeNeed> {
  const map = new Map<number, LineConsumeNeed>();
  for (const n of lineNeeds) map.set(n.lineIndex, n);
  return map;
}

function seedResolutionMap(
  lineNeeds: readonly LineConsumeNeed[],
  shortfalls: ReadonlyMap<number, LineShortfall>
): Map<number, LineResolution> {
  const map = new Map<number, LineResolution>();
  for (const need of lineNeeds) {
    if (need.optional) continue;
    const shortfall = shortfalls.get(need.lineIndex);
    if (shortfall === undefined || shortfall.available >= shortfall.needed) {
      map.set(need.lineIndex, { kind: 'fifo' });
    }
  }
  return map;
}

/**
 * A resolution covers a shortfall when the user-selected quantities meet or
 * exceed `shortfall.needed`. `fifo` never covers a real shortfall (that's
 * why it surfaced as unresolved in the first place); `external` always does
 * (the user is asserting the need is met outside the batch system).
 */
function isQtyCovered(resolution: LineResolution, shortfall: LineShortfall): boolean {
  switch (resolution.kind) {
    case 'fifo':
      return false;
    case 'external':
      return true;
    case 'batch-override':
      return resolution.consumeQty >= shortfall.needed;
    case 'partial':
      return resolution.consumeQty + resolution.externalQty >= shortfall.needed;
  }
}

function countUnresolvedShortfalls(
  shortfalls: ReadonlyMap<number, LineShortfall>,
  resolutionMap: ReadonlyMap<number, LineResolution>,
  needsByLine: ReadonlyMap<number, LineConsumeNeed>
): number {
  let count = 0;
  for (const [lineIndex, shortfall] of shortfalls) {
    const need = needsByLine.get(lineIndex);
    if (need?.optional === true) continue;
    if (shortfall.available >= shortfall.needed) continue;
    const resolution = resolutionMap.get(lineIndex);
    if (resolution === undefined || !isQtyCovered(resolution, shortfall)) {
      count += 1;
    }
  }
  return count;
}

export function useCookResolution(args: UseCookResolutionArgs): UseCookResolutionResult {
  const { lineNeeds, shortfalls, scaleFactor } = args;

  const shortfallsByLine = useMemo(() => shortfallsByLineMap(shortfalls), [shortfalls]);
  const needsByLine = useMemo(() => needsByLineMap(lineNeeds), [lineNeeds]);

  const seedKey = useMemo(
    () => `${String(scaleFactor)}|${lineNeeds.map((n) => n.lineIndex).join(',')}`,
    [scaleFactor, lineNeeds]
  );
  const seedKeyRef = useRef<string>(seedKey);
  const [resolutionMap, setResolutionMap] = useState<Map<number, LineResolution>>(() =>
    seedResolutionMap(lineNeeds, shortfallsByLine)
  );
  const [scaleResetSignal, setScaleResetSignal] = useState(0);

  useEffect(() => {
    if (seedKeyRef.current === seedKey) return;
    seedKeyRef.current = seedKey;
    setResolutionMap(seedResolutionMap(lineNeeds, shortfallsByLine));
    setScaleResetSignal((n) => n + 1);
  }, [seedKey, lineNeeds, shortfallsByLine]);

  const setResolution = useCallback((lineIndex: number, resolution: LineResolution) => {
    setResolutionMap((prev) => {
      const next = new Map(prev);
      next.set(lineIndex, resolution);
      return next;
    });
  }, []);

  const unresolvedShortfallCount = useMemo(
    () => countUnresolvedShortfalls(shortfallsByLine, resolutionMap, needsByLine),
    [shortfallsByLine, resolutionMap, needsByLine]
  );

  return {
    resolutionMap,
    unresolvedShortfallCount,
    shortfallsByLine,
    needsByLine,
    setResolution,
    scaleResetSignal,
  };
}
