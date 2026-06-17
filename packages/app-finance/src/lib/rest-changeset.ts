import type { ChangeSet, ChangeSetOp } from '@pops/api/modules/core/corrections/types';

import type { ImportsReevaluateWithPendingRulesData } from '../finance-api/index.js';

type RestCorrectionChangeSet = NonNullable<
  ImportsReevaluateWithPendingRulesData['body']
>['pendingChangeSets'][number]['changeSet'];
type RestCorrectionOp = RestCorrectionChangeSet['ops'][number];
type RestCorrectionOpData = Extract<RestCorrectionOp, { op: 'add' }>['data'];

/**
 * The finance REST contract narrows correction-rule `transactionType` to a
 * non-null enum, while the legacy `@pops/api` correction op data permits
 * `null`. The two are runtime-compatible: a `null` transactionType means
 * "unset", which the contract expresses by omitting the field. Coerce
 * `null` → omitted so the value satisfies the generated body losslessly.
 */
function normalizeData<T extends { transactionType?: 'purchase' | 'transfer' | 'income' | null }>(
  data: T
): Omit<T, 'transactionType'> & { transactionType?: 'purchase' | 'transfer' | 'income' } {
  const { transactionType, ...rest } = data;
  return transactionType == null ? rest : { ...rest, transactionType };
}

function toRestCorrectionOp(op: ChangeSetOp): RestCorrectionOp {
  switch (op.op) {
    case 'add':
      return { op: 'add', data: normalizeData(op.data) satisfies RestCorrectionOpData };
    case 'edit':
      return { op: 'edit', id: op.id, data: normalizeData(op.data) };
    case 'disable':
      return { op: 'disable', id: op.id };
    case 'remove':
      return { op: 'remove', id: op.id };
  }
}

export function toRestCorrectionChangeSet(changeSet: ChangeSet): RestCorrectionChangeSet {
  return {
    source: changeSet.source,
    reason: changeSet.reason,
    ops: changeSet.ops.map(toRestCorrectionOp),
  };
}

export type { RestCorrectionChangeSet };
