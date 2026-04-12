import type { ConfirmedTransaction } from "@pops/api/modules/finance/imports";
import type { ChangeSet } from "@pops/api/modules/core/corrections/types";
import type { PendingEntity, PendingChangeSet } from "../store/importStore";

// ---------------------------------------------------------------------------
// CommitPayload — PRD-030 US-09
// ---------------------------------------------------------------------------

export interface CommitPayload {
  entities: PendingEntity[];
  changeSets: ChangeSet[];
  transactions: ConfirmedTransaction[];
}

export interface DanglingEntityRefError {
  type: "dangling-entity-ref";
  tempId: string;
  changeSetTempId: string;
}

/**
 * Build a structured commit payload from pending entities, pending ChangeSets,
 * and confirmed transactions. Validates referential integrity: every temp entity
 * ID (`temp:entity:*`) referenced by a ChangeSet op must exist in the pending
 * entity list. Returns a plain snapshot (not a live store reference).
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
      if (op.op === "add" && op.data.entityId?.startsWith("temp:entity:")) {
        if (!validTempEntityIds.has(op.data.entityId)) {
          const err: DanglingEntityRefError = {
            type: "dangling-entity-ref",
            tempId: op.data.entityId,
            changeSetTempId: pcs.tempId,
          };
          throw Object.assign(
            new Error(
              `Dangling entity reference: ChangeSet ${pcs.tempId} references temp entity ${op.data.entityId} which does not exist in the pending entity list`
            ),
            err
          );
        }
      }
      if (op.op === "edit" && op.data.entityId?.startsWith("temp:entity:")) {
        if (!validTempEntityIds.has(op.data.entityId)) {
          const err: DanglingEntityRefError = {
            type: "dangling-entity-ref",
            tempId: op.data.entityId,
            changeSetTempId: pcs.tempId,
          };
          throw Object.assign(
            new Error(
              `Dangling entity reference: ChangeSet ${pcs.tempId} references temp entity ${op.data.entityId} which does not exist in the pending entity list`
            ),
            err
          );
        }
      }
    }
  }

  return {
    entities: [...pendingEntities],
    changeSets: pendingChangeSets.map((pcs) => pcs.changeSet),
    transactions: [...confirmedTransactions],
  };
}
