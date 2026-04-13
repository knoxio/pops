import type { ChangeSet } from '@pops/api/modules/core/corrections/types';
import type { ConfirmedTransaction } from '@pops/api/modules/finance/imports';

import type { PendingChangeSet, PendingEntity } from '../store/importStore';

// ---------------------------------------------------------------------------
// CommitPayload — PRD-030 US-09
// TODO: Move CommitPayload type to a shared package (e.g. @pops/types) before
// PRD-031 commit endpoint work, since both frontend and backend need this shape.
// ---------------------------------------------------------------------------

export interface CommitPayload {
  entities: PendingEntity[];
  changeSets: ChangeSet[];
  transactions: ConfirmedTransaction[];
}

export interface DanglingEntityRefError {
  type: 'dangling-entity-ref';
  tempId: string;
  changeSetTempId: string;
}

/**
 * Build a structured commit payload from pending entities, pending ChangeSets,
 * and confirmed transactions. Validates referential integrity: every temp entity
 * ID (`temp:entity:*`) referenced by a ChangeSet op must exist in the pending
 * entity list.
 *
 * Returns a shallow snapshot (spread copies of input arrays). The store's
 * replace-not-mutate pattern guarantees object identity changes on updates,
 * so shallow copies are sufficient for snapshot isolation.
 */
export function buildCommitPayload(
  pendingEntities: PendingEntity[],
  pendingChangeSets: PendingChangeSet[],
  confirmedTransactions: ConfirmedTransaction[]
): CommitPayload {
  // Build lookup of valid temp entity IDs
  const validTempEntityIds = new Set(pendingEntities.map((e) => e.tempId));

  // Validate ChangeSet ops don't reference dangling temp entity IDs
  for (const pcs of pendingChangeSets) {
    for (const op of pcs.changeSet.ops) {
      const entityId =
        (op.op === 'add' || op.op === 'edit') && op.data.entityId ? op.data.entityId : null;

      if (entityId?.startsWith('temp:entity:') && !validTempEntityIds.has(entityId)) {
        const err: DanglingEntityRefError = {
          type: 'dangling-entity-ref',
          tempId: entityId,
          changeSetTempId: pcs.tempId,
        };
        throw Object.assign(
          new Error(
            `Dangling entity reference: ChangeSet ${pcs.tempId} references temp entity ${entityId} which does not exist in the pending entity list`
          ),
          err
        );
      }
    }
  }

  return {
    entities: [...pendingEntities],
    changeSets: pendingChangeSets.map((pcs) => pcs.changeSet),
    transactions: [...confirmedTransactions],
  };
}
