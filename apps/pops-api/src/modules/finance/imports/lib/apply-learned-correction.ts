import { logger } from '../../../../lib/logger.js';
import { findAllMatchingCorrectionFromRules } from '../../../core/corrections/pure-service.js';
import { findAllMatchingCorrectionFromDB } from '../../../core/corrections/service.js';
import { classifyCorrectionMatch } from '../../../core/corrections/types.js';
import { buildSuggestedTags, parseCorrectionTags } from './tag-management.js';

import type { CorrectionRow } from '../../../core/corrections/types.js';
import type { MatchedRule, ParsedTransaction, ProcessedTransaction } from '../types.js';

export interface ApplyLearnedCorrectionArgs {
  transaction: ParsedTransaction;
  minConfidence: number;
  knownTags: string[];
  index: number;
  total: number;
  rules?: CorrectionRow[];
}

export interface ApplyLearnedCorrectionResult {
  processed: ProcessedTransaction;
  bucket: 'matched' | 'uncertain';
}

function toMatchedRules(rules: CorrectionRow[]): MatchedRule[] {
  return rules.map((rule) => ({
    ruleId: rule.id,
    pattern: rule.descriptionPattern,
    matchType: rule.matchType,
    confidence: rule.confidence,
    priority: rule.priority,
    entityId: rule.entityId ?? null,
    entityName: rule.entityName ?? null,
  }));
}

function buildTypeOnlyMatch(
  transaction: ParsedTransaction,
  correction: CorrectionRow,
  matchedRules: MatchedRule[],
  knownTags: string[]
): ProcessedTransaction {
  return {
    ...transaction,
    location: correction.location ?? transaction.location,
    transactionType: correction.transactionType ?? undefined,
    entity: { matchType: 'learned', confidence: correction.confidence },
    ruleProvenance: {
      source: 'correction',
      ruleId: correction.id,
      pattern: correction.descriptionPattern,
      matchType: correction.matchType,
      confidence: correction.confidence,
    },
    matchedRules,
    status: 'matched',
    suggestedTags: buildSuggestedTags({
      description: transaction.description,
      entityId: null,
      correctionTags: parseCorrectionTags(correction.tags),
      aiCategory: null,
      knownTags,
      correctionPattern: correction.descriptionPattern,
    }),
  };
}

interface EntityMatchArgs {
  transaction: ParsedTransaction;
  correction: CorrectionRow;
  matchedRules: MatchedRule[];
  status: 'matched' | 'uncertain';
  entityId: string;
  knownTags: string[];
}

function buildEntityMatch(args: EntityMatchArgs): ProcessedTransaction {
  const { transaction, correction, matchedRules, status, entityId, knownTags } = args;
  return {
    ...transaction,
    location: correction.location ?? transaction.location,
    entity: {
      entityId,
      entityName: correction.entityName ?? 'Unknown',
      matchType: 'learned',
      confidence: correction.confidence,
    },
    ruleProvenance: {
      source: 'correction',
      ruleId: correction.id,
      pattern: correction.descriptionPattern,
      matchType: correction.matchType,
      confidence: correction.confidence,
    },
    matchedRules,
    status,
    suggestedTags: buildSuggestedTags({
      description: transaction.description,
      entityId,
      correctionTags: parseCorrectionTags(correction.tags),
      aiCategory: null,
      knownTags,
      correctionPattern: correction.descriptionPattern,
    }),
  };
}

function handleNoEntityCorrection(
  args: ApplyLearnedCorrectionArgs,
  correction: CorrectionRow,
  matchedRules: MatchedRule[],
  status: 'matched' | 'uncertain'
): ApplyLearnedCorrectionResult | null {
  const { transaction, knownTags, index, total } = args;
  if (correction.transactionType) {
    logger.debug(
      {
        index,
        total,
        description: transaction.description.slice(0, 50),
        transactionType: correction.transactionType,
        confidence: correction.confidence,
      },
      '[Import] Applied learned type-only correction'
    );
    return {
      processed: buildTypeOnlyMatch(transaction, correction, matchedRules, knownTags),
      bucket: 'matched',
    };
  }
  logger.debug(
    {
      index,
      total,
      description: transaction.description.slice(0, 50),
      confidence: correction.confidence,
      status,
    },
    '[Import] Learned correction matched but has no entityId; falling through'
  );
  return null;
}

export function applyLearnedCorrection(
  args: ApplyLearnedCorrectionArgs
): ApplyLearnedCorrectionResult | null {
  const { transaction, minConfidence, knownTags, index, total, rules } = args;

  const allMatchingRules = rules
    ? findAllMatchingCorrectionFromRules(transaction.description, rules, minConfidence)
    : findAllMatchingCorrectionFromDB(transaction.description, minConfidence);

  if (allMatchingRules.length === 0) return null;

  const correction = allMatchingRules[0];
  if (!correction) return null;

  const { status } = classifyCorrectionMatch(correction);
  const entityId = correction.entityId;
  const matchedRules = toMatchedRules(allMatchingRules);

  if (!entityId) return handleNoEntityCorrection(args, correction, matchedRules, status);

  logger.debug(
    {
      index,
      total,
      description: transaction.description.slice(0, 50),
      entityName: correction.entityName,
      confidence: correction.confidence,
      status,
    },
    '[Import] Applied learned correction'
  );

  return {
    processed: buildEntityMatch({
      transaction,
      correction,
      matchedRules,
      status,
      entityId,
      knownTags,
    }),
    bucket: status === 'matched' ? 'matched' : 'uncertain',
  };
}
