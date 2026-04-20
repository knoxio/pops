import { COMMIT_TEMP_ENTITY_PREFIX } from './commit-validation.js';

import type { TagRuleChangeSet } from '../../../core/tag-rules/types.js';
import type { CommitPayload } from '../types.js';

function resolveOpEntityId<TOp extends { op: string; data?: { entityId?: string | null } }>(
  op: TOp,
  tempIdMap: Map<string, string>
): TOp {
  if (
    (op.op === 'add' || op.op === 'edit') &&
    op.data?.entityId?.startsWith(COMMIT_TEMP_ENTITY_PREFIX)
  ) {
    const realId = tempIdMap.get(op.data.entityId);
    return { ...op, data: { ...op.data, entityId: realId ?? op.data.entityId } };
  }
  return op;
}

export function resolveChangeSetTempIds(
  cs: CommitPayload['changeSets'][number],
  tempIdMap: Map<string, string>
): CommitPayload['changeSets'][number] {
  return { ...cs, ops: cs.ops.map((op) => resolveOpEntityId(op, tempIdMap)) };
}

export function resolveTagRuleChangeSetTempIds(
  cs: TagRuleChangeSet,
  tempIdMap: Map<string, string>
): TagRuleChangeSet {
  return { ...cs, ops: cs.ops.map((op) => resolveOpEntityId(op, tempIdMap)) };
}

function collectTagsFromOp(op: TagRuleChangeSet['ops'][number], tags: Set<string>): void {
  if (op.op !== 'add' || !op.data.tags) return;
  for (const t of op.data.tags) {
    const s = t.trim();
    if (s) tags.add(s);
  }
}

export function collectTagsFromTagRuleChangeSet(cs: TagRuleChangeSet): string[] {
  const tags = new Set<string>();
  for (const op of cs.ops) collectTagsFromOp(op, tags);
  return [...tags];
}
