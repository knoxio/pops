import { and, eq, sql } from 'drizzle-orm';

import { transactionCorrections, transactions } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { parseJsonStringArray } from '../../../../shared/json.js';
import {
  applyChangeSetToRules,
  buildTargetRulesMap,
  computeImpactCounts,
  findMatchingCorrectionFromRules,
  mergeTags,
  outcomeChanged,
  outcomeFromMatch,
} from '../pure-service.js';
import { normalizeDescription } from '../types.js';
import { interpretRejectionFeedback, loadLatestRejectedFeedback } from './ai-inference.js';

import type {
  ChangeSet,
  ChangeSetImpactItem,
  ChangeSetProposal,
  CorrectionClassificationOutcome,
  CorrectionSignal,
} from '../types.js';

export async function proposeChangeSetFromCorrectionSignal(args: {
  signal: CorrectionSignal;
  minConfidence: number;
  maxPreviewItems: number;
}): Promise<ChangeSetProposal> {
  const db = getDrizzle();

  const normalizedPatternForLookup = normalizeDescription(args.signal.descriptionPattern);
  const latestFeedback = loadLatestRejectedFeedback({
    matchType: args.signal.matchType,
    normalizedPattern: normalizedPatternForLookup,
  });

  const effectiveSignal = latestFeedback
    ? await interpretRejectionFeedback(
        args.signal,
        latestFeedback.changeSet,
        latestFeedback.feedback
      )
    : args.signal;

  const normalizedPattern = normalizeDescription(effectiveSignal.descriptionPattern);
  const matchType = effectiveSignal.matchType;

  const existing = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.matchType, matchType),
        eq(transactionCorrections.descriptionPattern, normalizedPattern)
      )
    )
    .get();

  const changeSet: ChangeSet = existing
    ? {
        source: latestFeedback ? 'correction-signal-followup' : 'correction-signal',
        reason: latestFeedback
          ? `Follow-up proposal after rejection feedback: "${latestFeedback.feedback}"`
          : 'Update existing correction rule from user correction signal',
        ops: [
          {
            op: 'edit',
            id: existing.id,
            data: {
              entityId: effectiveSignal.entityId,
              entityName: effectiveSignal.entityName,
              location: effectiveSignal.location,
              tags: effectiveSignal.tags,
              transactionType: effectiveSignal.transactionType,
            },
          },
        ],
      }
    : {
        source: latestFeedback ? 'correction-signal-followup' : 'correction-signal',
        reason: latestFeedback
          ? `Follow-up proposal after rejection feedback: "${latestFeedback.feedback}"`
          : 'Create new correction rule from user correction signal',
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: normalizedPattern,
              matchType,
              entityId: effectiveSignal.entityId ?? null,
              entityName: effectiveSignal.entityName ?? null,
              location: effectiveSignal.location ?? null,
              tags: effectiveSignal.tags ?? [],
              transactionType: effectiveSignal.transactionType ?? null,
              confidence: 0.95,
              isActive: true,
            },
          },
        ],
      };

  const sqlNormalizedDescription = sql`upper(${transactions.description})`;
  const sqlNoDigits = sql`replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(${sqlNormalizedDescription}, '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '')`;
  const sqlCollapsedSpaces = sql`replace(replace(replace(${sqlNoDigits}, '  ', ' '), '  ', ' '), '  ', ' ')`;

  const sqlPrefilterExpression =
    matchType === 'regex' ? sqlNormalizedDescription : sqlCollapsedSpaces;
  const upperPattern = normalizedPattern;
  const candidates = db
    .select({
      id: transactions.id,
      description: transactions.description,
      type: transactions.type,
      tags: transactions.tags,
      entityId: transactions.entityId,
      entityName: transactions.entityName,
      location: transactions.location,
    })
    .from(transactions)
    .where(
      matchType === 'regex'
        ? undefined
        : sql`${sqlPrefilterExpression} LIKE '%' || ${upperPattern} || '%'`
    )
    .limit(args.maxPreviewItems)
    .all();

  const rulesBefore = db.select().from(transactionCorrections).all();
  const rulesAfter = applyChangeSetToRules(rulesBefore, changeSet);

  const affected: ChangeSetImpactItem[] = [];

  for (const t of candidates) {
    const matchBefore = findMatchingCorrectionFromRules(
      t.description,
      rulesBefore,
      args.minConfidence
    );
    const matchAfter = findMatchingCorrectionFromRules(
      t.description,
      rulesAfter,
      args.minConfidence
    );

    const beforeBase = outcomeFromMatch(matchBefore);
    const afterBase = outcomeFromMatch(matchAfter);

    const before: CorrectionClassificationOutcome = {
      ...beforeBase,
      tags: mergeTags(parseJsonStringArray(t.tags), beforeBase.tags).toSorted(),
    };
    const after: CorrectionClassificationOutcome = {
      ...afterBase,
      tags: mergeTags(parseJsonStringArray(t.tags), afterBase.tags).toSorted(),
    };

    const changed = outcomeChanged(before, after);
    if (!changed) continue;

    affected.push({
      transactionId: t.id,
      description: t.description,
      before,
      after,
    });
  }

  const counts = computeImpactCounts(affected);

  const baseRationale = existing
    ? `Edit correction rule ${existing.id} (${matchType}:${normalizedPattern}) based on correction signal`
    : `Add new correction rule (${matchType}:${normalizedPattern}) based on correction signal`;
  const rationale = latestFeedback
    ? `${baseRationale}. Follow-up after rejection feedback: "${latestFeedback.feedback}"`
    : baseRationale;

  return {
    changeSet,
    rationale,
    preview: {
      counts,
      affected,
    },
    targetRules: buildTargetRulesMap(changeSet, rulesBefore),
  };
}
