/**
 * Background-ticker hooks for the pillar registry.
 *
 * Split from the core CRUD in `pillar-registry.ts` so that file stays
 * under the per-file line cap as the registry accrues columns.
 */
import { eq } from 'drizzle-orm';

import { pillarRegistry } from '../schema.js';

import type { CoreDb } from './internal.js';
import type { PillarStatus } from './pillar-registry.js';

export interface StatusTransition {
  readonly pillarId: string;
  readonly previousStatus: PillarStatus;
  readonly nextStatus: PillarStatus;
  readonly at: string;
}

export interface ApplyStatusUpdate {
  readonly pillarId: string;
  readonly status: PillarStatus;
  readonly statusUpdatedAt: string;
}

/**
 * Persist a batch of status updates emitted by the background ticker.
 * One UPDATE per row, all inside a single SQLite transaction so a tick
 * is atomic relative to concurrent heartbeats / registrations.
 */
export function applyStatusUpdates(db: CoreDb, updates: readonly ApplyStatusUpdate[]): void {
  if (updates.length === 0) return;
  db.transaction((tx) => {
    for (const update of updates) {
      tx.update(pillarRegistry)
        .set({
          status: update.status,
          statusUpdatedAt: update.statusUpdatedAt,
        })
        .where(eq(pillarRegistry.pillarId, update.pillarId))
        .run();
    }
  });
}
