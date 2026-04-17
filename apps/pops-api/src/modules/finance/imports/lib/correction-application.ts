import { logger } from '../../../../lib/logger.js';
import {
  applyChangeSetToRules,
  findAllMatchingCorrectionFromRules,
} from '../../../core/corrections/pure-service.js';
import {
  findAllMatchingCorrectionFromDB,
  listCorrections,
} from '../../../core/corrections/service.js';
import { classifyCorrectionMatch } from '../../../core/corrections/types.js';
import { loadEntityMaps } from './entity-lookup.js';
import { matchEntity } from './entity-matcher.js';
import { buildSuggestedTags, loadKnownTags, parseCorrectionTags } from './tag-management.js';

import type { ChangeSet, CorrectionRow } from '../../../core/corrections/types.js';
import type {
  MatchedRule,
  ParsedTransaction,
  ProcessedTransaction,
  ProcessImportOutput,
} from '../types.js';

export function applyLearnedCorrection(args: {
  transaction: ParsedTransaction;
  minConfidence: number;
  knownTags: string[];
  index: number;
  total: number;
  /** When provided, matches against this rule set instead of reading from DB. */
  rules?: CorrectionRow[];
}): { processed: ProcessedTransaction; bucket: 'matched' | 'uncertain' } | null {
  const { transaction, minConfidence, knownTags, index, total, rules } = args;

  // Collect ALL matching rules in priority order — first is the winner, rest are overridden.
  const allMatchingRules = rules
    ? findAllMatchingCorrectionFromRules(transaction.description, rules, minConfidence)
    : findAllMatchingCorrectionFromDB(transaction.description, minConfidence);

  if (allMatchingRules.length === 0) return null;

  const correction = allMatchingRules[0];
  if (!correction) return null;
  const { status } = classifyCorrectionMatch(correction);
  const entityId = correction.entityId;

  // Build the matchedRules array for override indicators (US-07).
  const matchedRules: MatchedRule[] = allMatchingRules.map((rule: CorrectionRow) => ({
    ruleId: rule.id,
    pattern: rule.descriptionPattern,
    matchType: rule.matchType,
    confidence: rule.confidence,
    priority: rule.priority,
    entityId: rule.entityId ?? null,
    entityName: rule.entityName ?? null,
  }));

  if (!entityId) {
    // Transfer/income rules are allowed to classify without assigning an entity.
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
        processed: {
          ...transaction,
          location: correction.location ?? transaction.location,
          transactionType: correction.transactionType,
          entity: {
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
          status: 'matched',
          suggestedTags: buildSuggestedTags(
            transaction.description,
            null,
            parseCorrectionTags(correction.tags),
            null,
            knownTags,
            correction.descriptionPattern
          ),
        },
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
    processed: {
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
      suggestedTags: buildSuggestedTags(
        transaction.description,
        entityId,
        parseCorrectionTags(correction.tags),
        null,
        knownTags,
        correction.descriptionPattern
      ),
    },
    bucket: status === 'matched' ? 'matched' : 'uncertain',
  };
}

export function reevaluateImportSessionResult(args: {
  result: ProcessImportOutput;
  minConfidence: number;
}): { nextResult: ProcessImportOutput; affectedCount: number } {
  const { result, minConfidence } = args;

  const { entityLookup, aliasMap: aliases } = loadEntityMaps();
  const knownTags = loadKnownTags();

  const nextMatched: ProcessedTransaction[] = [...result.matched];
  const nextUncertain: ProcessedTransaction[] = [];
  const nextFailed: ProcessedTransaction[] = [];

  let affectedCount = 0;

  const remaining: Array<{ tx: ProcessedTransaction; bucket: 'uncertain' | 'failed' }> = [
    ...result.uncertain.map((tx) => ({ tx, bucket: 'uncertain' as const })),
    ...result.failed.map((tx) => ({ tx, bucket: 'failed' as const })),
  ];

  for (let i = 0; i < remaining.length; i++) {
    const item = remaining[i];
    if (!item) continue;

    const prevTx = item.tx;
    const prevBucket = item.bucket;

    // Stage 1: Corrections (learned rules)
    const correctionApplied = applyLearnedCorrection({
      transaction: prevTx,
      minConfidence,
      knownTags,
      index: i + 1,
      total: remaining.length,
    });

    if (correctionApplied) {
      const nextBucket = correctionApplied.bucket;
      const nextTx = correctionApplied.processed;

      const changed =
        prevBucket !== nextBucket ||
        prevTx.status !== nextTx.status ||
        prevTx.transactionType !== nextTx.transactionType ||
        prevTx.entity.entityId !== nextTx.entity.entityId ||
        prevTx.entity.entityName !== nextTx.entity.entityName ||
        prevTx.entity.matchType !== nextTx.entity.matchType;

      if (changed) affectedCount += 1;

      if (nextBucket === 'matched') nextMatched.push(nextTx);
      else nextUncertain.push(nextTx);
      continue;
    }

    // Stage 2: Universal entity matching (aliases → exact → prefix → contains).
    // We intentionally do NOT re-run AI in this synchronous path.
    const match = matchEntity(prevTx.description, entityLookup, aliases);
    if (match) {
      const entityEntry = entityLookup.get(match.entityName.toLowerCase());
      if (!entityEntry) {
        // If lookup is inconsistent, fall back to leaving it as-is rather than crashing the session.
        if (prevBucket === 'failed') nextFailed.push(prevTx);
        else nextUncertain.push(prevTx);
        continue;
      }

      const nextTx: ProcessedTransaction = {
        ...prevTx,
        entity: {
          entityId: entityEntry.id,
          entityName: entityEntry.name,
          matchType: match.matchType,
        },
        status: 'matched',
        error: undefined,
        suggestedTags: buildSuggestedTags(prevTx.description, entityEntry.id, [], null, knownTags),
      };

      const changed =
        prevTx.status !== nextTx.status ||
        prevTx.transactionType !== nextTx.transactionType ||
        prevTx.entity.entityId !== nextTx.entity.entityId ||
        prevTx.entity.entityName !== nextTx.entity.entityName ||
        prevTx.entity.matchType !== nextTx.entity.matchType;

      if (changed) affectedCount += 1;
      nextMatched.push(nextTx);
      continue;
    }

    // No deterministic match found: preserve current item as-is.
    if (prevBucket === 'failed') nextFailed.push(prevTx);
    else nextUncertain.push(prevTx);
  }

  return {
    nextResult: {
      ...result,
      matched: nextMatched,
      uncertain: nextUncertain,
      failed: nextFailed,
    },
    affectedCount,
  };
}

/**
 * Re-evaluate import session using merged rules (DB + pending ChangeSets).
 * Same logic as reevaluateImportSessionResult but uses the provided merged
 * rules for correction matching instead of reading from DB.
 */
export function reevaluateImportSessionWithRules(args: {
  result: ProcessImportOutput;
  minConfidence: number;
  pendingChangeSets: { changeSet: ChangeSet }[];
}): { nextResult: ProcessImportOutput; affectedCount: number } {
  const { result, minConfidence, pendingChangeSets } = args;

  // Build merged rules: DB rules + pending ChangeSets applied in order
  const dbRules = listCorrections(undefined, 50_000, 0).rows;
  const mergedRules =
    pendingChangeSets.length > 0
      ? pendingChangeSets.reduce((acc, pcs) => applyChangeSetToRules(acc, pcs.changeSet), dbRules)
      : dbRules;

  const { entityLookup, aliasMap: aliases } = loadEntityMaps();
  const knownTags = loadKnownTags();

  const nextMatched: ProcessedTransaction[] = [...result.matched];
  const nextUncertain: ProcessedTransaction[] = [];
  const nextFailed: ProcessedTransaction[] = [];

  let affectedCount = 0;

  const remaining: Array<{ tx: ProcessedTransaction; bucket: 'uncertain' | 'failed' }> = [
    ...result.uncertain.map((tx) => ({ tx, bucket: 'uncertain' as const })),
    ...result.failed.map((tx) => ({ tx, bucket: 'failed' as const })),
  ];

  for (let i = 0; i < remaining.length; i++) {
    const item = remaining[i];
    if (!item) continue;

    const prevTx = item.tx;
    const prevBucket = item.bucket;

    // Stage 1: Corrections using merged rules
    const correctionApplied = applyLearnedCorrection({
      transaction: prevTx,
      rules: mergedRules,
      minConfidence,
      knownTags,
      index: i + 1,
      total: remaining.length,
    });

    if (correctionApplied) {
      const nextBucket = correctionApplied.bucket;
      const nextTx = correctionApplied.processed;

      const changed =
        prevBucket !== nextBucket ||
        prevTx.status !== nextTx.status ||
        prevTx.transactionType !== nextTx.transactionType ||
        prevTx.entity.entityId !== nextTx.entity.entityId ||
        prevTx.entity.entityName !== nextTx.entity.entityName ||
        prevTx.entity.matchType !== nextTx.entity.matchType;

      if (changed) affectedCount += 1;

      if (nextBucket === 'matched') nextMatched.push(nextTx);
      else nextUncertain.push(nextTx);
      continue;
    }

    // Stage 2: Universal entity matching
    const match = matchEntity(prevTx.description, entityLookup, aliases);
    if (match) {
      const entityEntry = entityLookup.get(match.entityName.toLowerCase());
      if (!entityEntry) {
        if (prevBucket === 'failed') nextFailed.push(prevTx);
        else nextUncertain.push(prevTx);
        continue;
      }

      const nextTx: ProcessedTransaction = {
        ...prevTx,
        entity: {
          entityId: entityEntry.id,
          entityName: entityEntry.name,
          matchType: match.matchType,
        },
        status: 'matched',
        error: undefined,
        suggestedTags: buildSuggestedTags(prevTx.description, entityEntry.id, [], null, knownTags),
      };

      // Entity match found for a previously uncertain/failed tx — always counts as affected.
      affectedCount += 1;
      nextMatched.push(nextTx);
      continue;
    }

    // No deterministic match found: preserve current item as-is.
    if (prevBucket === 'failed') nextFailed.push(prevTx);
    else nextUncertain.push(prevTx);
  }

  return {
    nextResult: {
      ...result,
      matched: nextMatched,
      uncertain: nextUncertain,
      failed: nextFailed,
    },
    affectedCount,
  };
}
