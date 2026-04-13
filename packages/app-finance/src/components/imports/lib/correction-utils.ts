/**
 * Display helpers for correction operations.
 *
 * Extracted from correction-proposal-shared.ts (tb-365).
 */
import type { LocalOp, OpKind } from '../correction-proposal/types';

export function opKindLabel(kind: OpKind): string {
  if (kind === 'add') return 'Add rule';
  if (kind === 'edit') return 'Edit rule';
  if (kind === 'disable') return 'Disable rule';
  return 'Remove rule';
}

export function opKindBadgeVariant(
  kind: OpKind
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (kind === 'add') return 'default';
  if (kind === 'edit') return 'secondary';
  if (kind === 'disable') return 'outline';
  return 'destructive';
}

export function opSummary(op: LocalOp): string {
  if (op.kind === 'add') {
    const pat = op.data.descriptionPattern || '(no pattern)';
    const outcome = op.data.entityName ?? op.data.transactionType ?? 'unclassified';
    return `${pat} → ${outcome}`;
  }
  const pat = op.targetRule?.descriptionPattern ?? '(rule)';
  if (op.kind === 'edit') {
    const outcome = op.data.entityName ?? op.data.transactionType ?? 'edit';
    return `${pat} → ${outcome}`;
  }
  if (op.kind === 'disable') return `${pat} (disable)`;
  return `${pat} (remove)`;
}

export function matchTypeLabel(matchType: 'exact' | 'contains' | 'regex'): string {
  if (matchType === 'exact') return 'matches exactly';
  if (matchType === 'contains') return 'contains';
  return 'matches regex';
}
