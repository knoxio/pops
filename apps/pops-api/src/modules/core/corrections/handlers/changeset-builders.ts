import type { ChangeSet, CorrectionRow, CorrectionSignal } from '../types.js';

interface BuildArgs {
  effectiveSignal: CorrectionSignal;
  normalizedPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  hasFeedback: boolean;
  feedback?: string;
}

function describeReason(action: 'create' | 'update', args: BuildArgs): string {
  if (args.hasFeedback && args.feedback !== undefined) {
    return `Follow-up proposal after rejection feedback: "${args.feedback}"`;
  }
  return action === 'create'
    ? 'Create new correction rule from user correction signal'
    : 'Update existing correction rule from user correction signal';
}

function changeSetSource(hasFeedback: boolean): string {
  return hasFeedback ? 'correction-signal-followup' : 'correction-signal';
}

export function buildEditChangeSet(existing: CorrectionRow, args: BuildArgs): ChangeSet {
  return {
    source: changeSetSource(args.hasFeedback),
    reason: describeReason('update', args),
    ops: [
      {
        op: 'edit',
        id: existing.id,
        data: {
          entityId: args.effectiveSignal.entityId,
          entityName: args.effectiveSignal.entityName,
          location: args.effectiveSignal.location,
          tags: args.effectiveSignal.tags,
          transactionType: args.effectiveSignal.transactionType,
        },
      },
    ],
  };
}

export function buildAddChangeSet(args: BuildArgs): ChangeSet {
  return {
    source: changeSetSource(args.hasFeedback),
    reason: describeReason('create', args),
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern: args.normalizedPattern,
          matchType: args.matchType,
          entityId: args.effectiveSignal.entityId ?? null,
          entityName: args.effectiveSignal.entityName ?? null,
          location: args.effectiveSignal.location ?? null,
          tags: args.effectiveSignal.tags ?? [],
          transactionType: args.effectiveSignal.transactionType ?? null,
          confidence: 0.95,
          isActive: true,
        },
      },
    ],
  };
}
