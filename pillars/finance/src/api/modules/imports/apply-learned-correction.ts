/**
 * Apply the highest-priority learned correction rule to a transaction.
 *
 * Ported from the monolith `lib/apply-learned-correction.ts`, db-injected:
 * - DB matching → `transactionCorrectionsService.findAllMatchingTransactionCorrectionsFromDb`
 * - In-memory matching (merged/pending rules) → corrections module `findAllMatchingCorrectionFromRules`
 * - classification + tag parsing → corrections module helpers
 */
import { type FinanceDb, transactionCorrectionsService } from '../../../db/index.js';
import {
  classifyCorrectionMatch,
  type CorrectionRow,
  findAllMatchingCorrectionFromRules,
  parseCorrectionTags,
} from '../corrections/index.js';
import { buildSuggestedTags } from './tag-management.js';

import type { MatchedRule, ParsedTransaction, ProcessedTransaction } from './types.js';

export interface ApplyLearnedCorrectionArgs {
  transaction: ParsedTransaction;
  minConfidence: number;
  knownTags: string[];
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

interface TypeOnlyMatchArgs {
  db: FinanceDb;
  transaction: ParsedTransaction;
  correction: CorrectionRow;
  matchedRules: MatchedRule[];
  knownTags: string[];
}

function buildTypeOnlyMatch(args: TypeOnlyMatchArgs): ProcessedTransaction {
  const { db, transaction, correction, matchedRules, knownTags } = args;
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
    suggestedTags: buildSuggestedTags(db, {
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
  db: FinanceDb;
  transaction: ParsedTransaction;
  correction: CorrectionRow;
  matchedRules: MatchedRule[];
  status: 'matched' | 'uncertain';
  entityId: string;
  knownTags: string[];
}

function buildEntityMatch(args: EntityMatchArgs): ProcessedTransaction {
  const { db, transaction, correction, matchedRules, status, entityId, knownTags } = args;
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
    suggestedTags: buildSuggestedTags(db, {
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
  db: FinanceDb,
  args: ApplyLearnedCorrectionArgs,
  correction: CorrectionRow,
  matchedRules: MatchedRule[]
): ApplyLearnedCorrectionResult | null {
  if (!correction.transactionType) return null;
  return {
    processed: buildTypeOnlyMatch({
      db,
      transaction: args.transaction,
      correction,
      matchedRules,
      knownTags: args.knownTags,
    }),
    bucket: 'matched',
  };
}

export function applyLearnedCorrection(
  db: FinanceDb,
  args: ApplyLearnedCorrectionArgs
): ApplyLearnedCorrectionResult | null {
  const { transaction, minConfidence, knownTags, rules } = args;

  const allMatchingRules = rules
    ? findAllMatchingCorrectionFromRules(transaction.description, rules, minConfidence)
    : transactionCorrectionsService.findAllMatchingTransactionCorrectionsFromDb(
        db,
        transaction.description,
        minConfidence
      );

  const correction = allMatchingRules[0];
  if (!correction) return null;

  const { status } = classifyCorrectionMatch(correction);
  const entityId = correction.entityId;
  const matchedRules = toMatchedRules(allMatchingRules);

  if (!entityId) return handleNoEntityCorrection(db, args, correction, matchedRules);

  return {
    processed: buildEntityMatch({
      db,
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
