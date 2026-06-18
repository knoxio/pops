/**
 * Pure builders that turn a resolved correction signal into an add/edit
 * ChangeSet. Ported from the monolith `core/corrections/handlers/changeset-builders.ts`.
 */
import { type CorrectionSignal } from './ai-types.js';
import { type CorrectionRow } from './types.js';

import type { ChangeSet } from '../../../contract/rest-corrections.js';

/**
 * Confidence assigned to a rule created/refreshed via a user-approved proposal.
 * Stays above the matcher's default minConfidence (0.7) so the rule fires.
 */
export const PROPOSAL_APPROVED_CONFIDENCE = 0.95;

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
  const promotedConfidence = Math.max(existing.confidence, PROPOSAL_APPROVED_CONFIDENCE);
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
          confidence: promotedConfidence,
          isActive: true,
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
          confidence: PROPOSAL_APPROVED_CONFIDENCE,
          isActive: true,
        },
      },
    ],
  };
}
