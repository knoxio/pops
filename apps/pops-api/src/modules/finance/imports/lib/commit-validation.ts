import { ValidationError } from '../../../../shared/errors.js';

import type { CommitPayload } from '../types.js';

const TEMP_ENTITY_PREFIX = 'temp:entity:';

export const COMMIT_TEMP_ENTITY_PREFIX = TEMP_ENTITY_PREFIX;

function collectTempIdsFromOps(
  ops: { op: string; data?: { entityId?: string | null } }[],
  out: Set<string>
): void {
  for (const op of ops) {
    if (
      (op.op === 'add' || op.op === 'edit') &&
      op.data?.entityId?.startsWith(TEMP_ENTITY_PREFIX)
    ) {
      out.add(op.data.entityId);
    }
  }
}

function assertNoDuplicateNames(payload: CommitPayload): void {
  const names = new Set<string>();
  for (const entity of payload.entities) {
    const lower = entity.name.toLowerCase();
    if (names.has(lower)) {
      throw new ValidationError(`Duplicate entity name: '${entity.name}'`);
    }
    names.add(lower);
  }
}

export function validateCommitPayload(payload: CommitPayload): void {
  const tempIds = new Set(payload.entities.map((e) => e.tempId));
  if (tempIds.size !== payload.entities.length) {
    throw new ValidationError('Duplicate temp IDs in entities array');
  }
  assertNoDuplicateNames(payload);

  const referencedTempIds = new Set<string>();
  for (const cs of payload.changeSets) collectTempIdsFromOps(cs.ops, referencedTempIds);
  for (const cs of payload.tagRuleChangeSets) collectTempIdsFromOps(cs.ops, referencedTempIds);
  for (const txn of payload.transactions) {
    if (txn.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
      referencedTempIds.add(txn.entityId);
    }
  }

  for (const ref of referencedTempIds) {
    if (!tempIds.has(ref)) {
      throw new ValidationError(`Unknown temp ID referenced: '${ref}'`);
    }
  }
}
