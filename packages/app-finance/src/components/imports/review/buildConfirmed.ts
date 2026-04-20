import type { ConfirmedTransaction } from '@pops/api/modules/finance/imports';

import type { ProcessedTransaction } from '../../../store/importStore';

export function buildConfirmedTransactions(
  matched: ProcessedTransaction[]
): ConfirmedTransaction[] {
  return matched
    .filter((t) => {
      const isNoEntityType = t.transactionType === 'transfer' || t.transactionType === 'income';
      return isNoEntityType || (t.entity?.entityId && t.entity?.entityName);
    })
    .map((t) => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
      account: t.account,
      location: t.location,
      rawRow: t.rawRow,
      checksum: t.checksum,
      transactionType: t.transactionType,
      entityId: t.entity?.entityId,
      entityName: t.entity?.entityName,
      tags: (t.suggestedTags ?? []).map((s) => s.tag),
      suggestedTags: t.suggestedTags,
    }));
}
