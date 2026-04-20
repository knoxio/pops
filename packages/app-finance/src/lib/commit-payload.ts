import type { ChangeSet } from '@pops/api/modules/core/corrections/types';
import type { TagRuleChangeSet } from '@pops/api/modules/core/tag-rules/types';
import type { ConfirmedTransaction } from '@pops/api/modules/finance/imports';

import type {
  PendingChangeSet,
  PendingEntity,
  PendingTagRuleChangeSet,
} from '../store/importStore';

// ---------------------------------------------------------------------------
// CommitPayload — PRD-030 US-09
// TODO: Move CommitPayload type to a shared package (e.g. @pops/types) before
// PRD-031 commit endpoint work, since both frontend and backend need this shape.
// ---------------------------------------------------------------------------

export interface CommitPayload {
  entities: PendingEntity[];
  changeSets: ChangeSet[];
  tagRuleChangeSets: TagRuleChangeSet[];
  transactions: ConfirmedTransaction[];
}

export interface DanglingEntityRefError {
  type: 'dangling-entity-ref';
  tempId: string;
  changeSetTempId: string;
}

interface OpWithEntity {
  op: 'add' | 'edit' | 'disable' | 'remove';
  data?: { entityId?: string | null };
}

function getOpEntityId(op: OpWithEntity): string | null {
  if ((op.op === 'add' || op.op === 'edit') && op.data?.entityId) return op.data.entityId;
  return null;
}

function validateChangeSetEntities(
  pcsList: Array<{ tempId: string; changeSet: { ops: OpWithEntity[] } }>,
  validTempEntityIds: Set<string>,
  label: 'ChangeSet' | 'Tag rule ChangeSet'
): void {
  for (const pcs of pcsList) {
    for (const op of pcs.changeSet.ops) {
      const entityId = getOpEntityId(op);
      if (!entityId?.startsWith('temp:entity:') || validTempEntityIds.has(entityId)) continue;
      const err: DanglingEntityRefError = {
        type: 'dangling-entity-ref',
        tempId: entityId,
        changeSetTempId: pcs.tempId,
      };
      throw Object.assign(
        new Error(
          `Dangling entity reference: ${label} ${pcs.tempId} references temp entity ${entityId} which does not exist in the pending entity list`
        ),
        err
      );
    }
  }
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
  pendingTagRuleChangeSets: PendingTagRuleChangeSet[],
  confirmedTransactions: ConfirmedTransaction[]
): CommitPayload {
  const validTempEntityIds = new Set(pendingEntities.map((e) => e.tempId));
  validateChangeSetEntities(pendingChangeSets as never, validTempEntityIds, 'ChangeSet');
  validateChangeSetEntities(
    pendingTagRuleChangeSets as never,
    validTempEntityIds,
    'Tag rule ChangeSet'
  );
  return {
    entities: [...pendingEntities],
    changeSets: pendingChangeSets.map((pcs) => pcs.changeSet),
    tagRuleChangeSets: pendingTagRuleChangeSets.map((pcs) => pcs.changeSet),
    transactions: [...confirmedTransactions],
  };
}
