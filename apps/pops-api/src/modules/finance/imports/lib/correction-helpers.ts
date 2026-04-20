import type { ProcessedTransaction } from '../types.js';

export function transactionChanged(
  prev: ProcessedTransaction,
  next: ProcessedTransaction,
  prevBucket?: 'matched' | 'uncertain' | 'failed',
  nextBucket?: 'matched' | 'uncertain' | 'failed'
): boolean {
  if (prevBucket && nextBucket && prevBucket !== nextBucket) return true;
  if (prev.status !== next.status) return true;
  if (prev.transactionType !== next.transactionType) return true;
  if (prev.entity.entityId !== next.entity.entityId) return true;
  if (prev.entity.entityName !== next.entity.entityName) return true;
  return prev.entity.matchType !== next.entity.matchType;
}
