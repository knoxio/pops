/**
 * Preview transaction scoping.
 *
 * Extracted from correction-proposal-shared.ts (tb-365).
 */
import type { LocalOp } from '../correction-proposal/types';
import { transactionMatchesSignal } from './normalization';

/**
 * Server-side cap on `transactions` in `core.corrections.previewChangeSet`
 * (enforced by a zod `.max(2000)`). We mirror it here so the dialog never
 * ships a request that will be rejected.
 */
export const PREVIEW_CHANGESET_MAX_TRANSACTIONS = 2000;

interface ScopedPreviewTxnResult<T> {
  txns: T[];
  truncated: boolean;
}

/**
 * Build the scoped transaction list to feed into `previewChangeSet`. For
 * each op in the ChangeSet, keep any transaction whose description would
 * actually be matched by that op. After scoping, the result is hard-capped
 * at `PREVIEW_CHANGESET_MAX_TRANSACTIONS`.
 */
export function scopePreviewTransactions<T extends { description: string }>(
  ops: LocalOp[],
  previewTransactions: readonly T[]
): ScopedPreviewTxnResult<T> {
  const hasUnscopedRuleOp = ops.some((op) => op.kind !== 'add' && !op.targetRule);
  const filtered = hasUnscopedRuleOp
    ? [...previewTransactions]
    : previewTransactions.filter((t) =>
        ops.some((op) => {
          if (op.kind === 'add') {
            return transactionMatchesSignal(
              t.description,
              op.data.descriptionPattern,
              op.data.matchType
            );
          }
          const rule = op.targetRule;
          if (!rule) return false;
          return transactionMatchesSignal(t.description, rule.descriptionPattern, rule.matchType);
        })
      );

  if (filtered.length <= PREVIEW_CHANGESET_MAX_TRANSACTIONS) {
    return { txns: filtered, truncated: false };
  }
  return {
    txns: filtered.slice(0, PREVIEW_CHANGESET_MAX_TRANSACTIONS),
    truncated: true,
  };
}
