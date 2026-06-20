/**
 * Synchronous re-evaluation of an import session's remaining (uncertain/failed)
 * transactions against the current rule set, with no AI.
 *
 * Ported from the monolith `lib/correction-application.ts`, db-injected. Used by
 * applyChangeSetAndReevaluate (DB rules) and reevaluateWithPendingRules
 * (DB rules merged with un-persisted pending ChangeSets).
 */
import {
  type FinanceDb,
  importsService,
  transactionCorrectionsService,
} from '../../../db/index.js';
import { applyChangeSetToRules, type CorrectionRow } from '../corrections/index.js';
import { applyLearnedCorrection } from './apply-learned-correction.js';
import { matchEntity } from './entity-matcher.js';
import { transactionChanged } from './reevaluate-diff.js';
import { buildSuggestedTags, loadKnownTags } from './tag-management.js';

import type { ChangeSet } from '../../../contract/rest-corrections.js';
import type { EntityMaps } from '../../../db/index.js';
import type { ProcessedTransaction, ProcessImportOutput } from './types.js';

interface ReevaluateContext {
  db: FinanceDb;
  rules?: CorrectionRow[];
  minConfidence: number;
  knownTags: string[];
  entityLookup: EntityMaps['entityLookup'];
  aliases: EntityMaps['aliasMap'];
}

interface RemainingItem {
  tx: ProcessedTransaction;
  bucket: 'uncertain' | 'failed';
}

interface BucketAccumulator {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
}

interface StageResult {
  handled: boolean;
  changed: boolean;
}

function tryApplyCorrectionStage(
  item: RemainingItem,
  ctx: ReevaluateContext,
  buckets: BucketAccumulator
): StageResult {
  const correctionApplied = applyLearnedCorrection(ctx.db, {
    transaction: item.tx,
    minConfidence: ctx.minConfidence,
    knownTags: ctx.knownTags,
    rules: ctx.rules,
  });
  if (!correctionApplied) return { handled: false, changed: false };

  const nextTx = correctionApplied.processed;
  const nextBucket = correctionApplied.bucket;
  if (nextBucket === 'matched') buckets.matched.push(nextTx);
  else buckets.uncertain.push(nextTx);

  return { handled: true, changed: transactionChanged(item.tx, nextTx, item.bucket, nextBucket) };
}

function tryEntityMatchStage(
  item: RemainingItem,
  ctx: ReevaluateContext,
  buckets: BucketAccumulator,
  alwaysAffected: boolean
): StageResult {
  const match = matchEntity(item.tx.description, ctx.entityLookup, ctx.aliases);
  if (!match) return { handled: false, changed: false };

  const entityEntry = ctx.entityLookup.get(match.entityName.toLowerCase());
  if (!entityEntry) {
    if (item.bucket === 'failed') buckets.failed.push(item.tx);
    else buckets.uncertain.push(item.tx);
    return { handled: true, changed: false };
  }

  const nextTx: ProcessedTransaction = {
    ...item.tx,
    entity: { entityId: entityEntry.id, entityName: entityEntry.name, matchType: match.matchType },
    status: 'matched',
    error: undefined,
    suggestedTags: buildSuggestedTags(ctx.db, {
      description: item.tx.description,
      entityId: entityEntry.id,
      correctionTags: [],
      aiCategory: null,
      knownTags: ctx.knownTags,
    }),
  };

  buckets.matched.push(nextTx);
  return { handled: true, changed: alwaysAffected || transactionChanged(item.tx, nextTx) };
}

function processRemainingItem(
  item: RemainingItem,
  ctx: ReevaluateContext,
  buckets: BucketAccumulator,
  alwaysAffectedOnEntityMatch: boolean
): boolean {
  const corrStage = tryApplyCorrectionStage(item, ctx, buckets);
  if (corrStage.handled) return corrStage.changed;

  const entityStage = tryEntityMatchStage(item, ctx, buckets, alwaysAffectedOnEntityMatch);
  if (entityStage.handled) return entityStage.changed;

  if (item.bucket === 'failed') buckets.failed.push(item.tx);
  else buckets.uncertain.push(item.tx);
  return false;
}

function runReevaluate(
  result: ProcessImportOutput,
  ctx: ReevaluateContext,
  alwaysAffectedOnEntityMatch: boolean
): { nextResult: ProcessImportOutput; affectedCount: number } {
  const buckets: BucketAccumulator = { matched: [...result.matched], uncertain: [], failed: [] };

  const remaining: RemainingItem[] = [
    ...result.uncertain.map((tx) => ({ tx, bucket: 'uncertain' as const })),
    ...result.failed.map((tx) => ({ tx, bucket: 'failed' as const })),
  ];

  let affectedCount = 0;
  for (const item of remaining) {
    if (processRemainingItem(item, ctx, buckets, alwaysAffectedOnEntityMatch)) affectedCount += 1;
  }

  return {
    nextResult: {
      ...result,
      matched: buckets.matched,
      uncertain: buckets.uncertain,
      failed: buckets.failed,
    },
    affectedCount,
  };
}

/** Re-evaluate against the persisted DB rule set (post-apply). */
export function reevaluateImportSessionResult(args: {
  db: FinanceDb;
  result: ProcessImportOutput;
  minConfidence: number;
}): { nextResult: ProcessImportOutput; affectedCount: number } {
  const { entityLookup, aliasMap: aliases } = importsService.loadEntityMaps(args.db);
  return runReevaluate(
    args.result,
    {
      db: args.db,
      minConfidence: args.minConfidence,
      knownTags: loadKnownTags(args.db),
      entityLookup,
      aliases,
    },
    false
  );
}

/** Re-evaluate against merged rules (DB rules + un-persisted pending ChangeSets). */
export function reevaluateImportSessionWithRules(args: {
  db: FinanceDb;
  result: ProcessImportOutput;
  minConfidence: number;
  pendingChangeSets: { changeSet: ChangeSet }[];
}): { nextResult: ProcessImportOutput; affectedCount: number } {
  const dbRules = transactionCorrectionsService.listTransactionCorrections(args.db, {
    limit: 50_000,
    offset: 0,
  }).rows;
  const mergedRules =
    args.pendingChangeSets.length > 0
      ? args.pendingChangeSets.reduce(
          (acc, pcs) => applyChangeSetToRules(acc, pcs.changeSet),
          dbRules
        )
      : dbRules;

  const { entityLookup, aliasMap: aliases } = importsService.loadEntityMaps(args.db);
  return runReevaluate(
    args.result,
    {
      db: args.db,
      rules: mergedRules,
      minConfidence: args.minConfidence,
      knownTags: loadKnownTags(args.db),
      entityLookup,
      aliases,
    },
    true
  );
}
