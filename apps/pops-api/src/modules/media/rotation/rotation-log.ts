import { rotationLog } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

import type { RotationCycleResult } from './rotation-cycle-types.js';

export function writeRotationLog(result: RotationCycleResult): void {
  const db = getDrizzle();
  const hasDetails =
    result.marked.length > 0 ||
    result.removed.length > 0 ||
    result.added.length > 0 ||
    result.failed.length > 0;
  const details = hasDetails
    ? JSON.stringify({
        marked: result.marked,
        removed: result.removed,
        added: result.added,
        failed: result.failed,
      })
    : null;
  db.insert(rotationLog)
    .values({
      executedAt: new Date().toISOString(),
      moviesMarkedLeaving: result.moviesMarkedLeaving,
      moviesRemoved: result.moviesRemoved,
      moviesAdded: result.moviesAdded,
      removalsFailed: result.removalsFailed,
      freeSpaceGb: result.freeSpaceGb,
      targetFreeGb: result.targetFreeGb,
      skippedReason: result.skippedReason,
      details,
    })
    .run();
}
