import { and, eq } from 'drizzle-orm';

import { transactionCorrections } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { buildTargetRulesMap } from '../pure-service.js';
import { normalizeDescription } from '../types.js';
import { interpretRejectionFeedback, loadLatestRejectedFeedback } from './ai-inference.js';
import { buildAddChangeSet, buildEditChangeSet } from './changeset-builders.js';
import { computeChangeSetImpact } from './changeset-impact.js';

import type { ChangeSet, ChangeSetProposal, CorrectionRow, CorrectionSignal } from '../types.js';

interface FeedbackInfo {
  changeSet: ChangeSet;
  feedback: string;
}

async function resolveEffectiveSignal(
  signal: CorrectionSignal
): Promise<{ effectiveSignal: CorrectionSignal; feedback: FeedbackInfo | null }> {
  const normalizedPatternForLookup = normalizeDescription(signal.descriptionPattern);
  const latestFeedback = loadLatestRejectedFeedback({
    matchType: signal.matchType,
    normalizedPattern: normalizedPatternForLookup,
  });

  if (!latestFeedback) {
    return { effectiveSignal: signal, feedback: null };
  }

  const effectiveSignal = await interpretRejectionFeedback(
    signal,
    latestFeedback.changeSet,
    latestFeedback.feedback
  );
  return {
    effectiveSignal,
    feedback: { changeSet: latestFeedback.changeSet, feedback: latestFeedback.feedback },
  };
}

function findExistingRule(
  matchType: 'exact' | 'contains' | 'regex',
  normalizedPattern: string
): CorrectionRow | undefined {
  return getDrizzle()
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.matchType, matchType),
        eq(transactionCorrections.descriptionPattern, normalizedPattern)
      )
    )
    .get();
}

function describeRationale(
  existing: CorrectionRow | undefined,
  matchType: string,
  normalizedPattern: string,
  feedback: FeedbackInfo | null
): string {
  const baseRationale = existing
    ? `Edit correction rule ${existing.id} (${matchType}:${normalizedPattern}) based on correction signal`
    : `Add new correction rule (${matchType}:${normalizedPattern}) based on correction signal`;
  if (!feedback) return baseRationale;
  return `${baseRationale}. Follow-up after rejection feedback: "${feedback.feedback}"`;
}

export async function proposeChangeSetFromCorrectionSignal(args: {
  signal: CorrectionSignal;
  minConfidence: number;
  maxPreviewItems: number;
}): Promise<ChangeSetProposal> {
  const { effectiveSignal, feedback } = await resolveEffectiveSignal(args.signal);
  const normalizedPattern = normalizeDescription(effectiveSignal.descriptionPattern);
  const matchType = effectiveSignal.matchType;
  const existing = findExistingRule(matchType, normalizedPattern);

  const builderArgs = {
    effectiveSignal,
    normalizedPattern,
    matchType,
    hasFeedback: feedback !== null,
    feedback: feedback?.feedback,
  };
  const changeSet = existing
    ? buildEditChangeSet(existing, builderArgs)
    : buildAddChangeSet(builderArgs);

  const impact = computeChangeSetImpact({
    changeSet,
    matchType,
    normalizedPattern,
    minConfidence: args.minConfidence,
    maxPreviewItems: args.maxPreviewItems,
  });

  return {
    changeSet,
    rationale: describeRationale(existing, matchType, normalizedPattern, feedback),
    preview: { counts: impact.counts, affected: impact.affected },
    targetRules: buildTargetRulesMap(changeSet, impact.rulesBefore),
  };
}
