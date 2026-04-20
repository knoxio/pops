import { applyChangeSetToRules } from '../../../core/corrections/pure-service.js';
import { listCorrections } from '../../../core/corrections/service.js';
import { applyLearnedCorrection } from './apply-learned-correction.js';
import { transactionChanged } from './correction-helpers.js';
import { loadEntityMaps } from './entity-lookup.js';
import { matchEntity } from './entity-matcher.js';
import { buildSuggestedTags, loadKnownTags } from './tag-management.js';

import type { ChangeSet, CorrectionRow } from '../../../core/corrections/types.js';
import type { ProcessedTransaction, ProcessImportOutput } from '../types.js';

export { applyLearnedCorrection } from './apply-learned-correction.js';

interface ReevaluateContext {
  rules?: CorrectionRow[];
  minConfidence: number;
  knownTags: string[];
  entityLookup: ReturnType<typeof loadEntityMaps>['entityLookup'];
  aliases: ReturnType<typeof loadEntityMaps>['aliasMap'];
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

interface StageRunArgs {
  item: RemainingItem;
  ctx: ReevaluateContext;
  index: number;
  total: number;
  buckets: BucketAccumulator;
}

function tryApplyCorrectionStage(args: StageRunArgs): StageResult {
  const { item, ctx, index, total, buckets } = args;
  const correctionApplied = applyLearnedCorrection({
    transaction: item.tx,
    minConfidence: ctx.minConfidence,
    knownTags: ctx.knownTags,
    index,
    total,
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
    entity: {
      entityId: entityEntry.id,
      entityName: entityEntry.name,
      matchType: match.matchType,
    },
    status: 'matched',
    error: undefined,
    suggestedTags: buildSuggestedTags({
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

interface RemainingItemArgs {
  item: RemainingItem;
  ctx: ReevaluateContext;
  index: number;
  total: number;
  buckets: BucketAccumulator;
  alwaysAffectedOnEntityMatch: boolean;
}

function processRemainingItem(args: RemainingItemArgs): boolean {
  const { item, ctx, buckets, alwaysAffectedOnEntityMatch } = args;
  const corrStage = tryApplyCorrectionStage({
    item,
    ctx,
    index: args.index,
    total: args.total,
    buckets,
  });
  if (corrStage.handled) return corrStage.changed;

  const entityStage = tryEntityMatchStage(item, ctx, buckets, alwaysAffectedOnEntityMatch);
  if (entityStage.handled) return entityStage.changed;

  if (item.bucket === 'failed') buckets.failed.push(item.tx);
  else buckets.uncertain.push(item.tx);
  return false;
}

interface RunReevaluateArgs {
  result: ProcessImportOutput;
  ctx: ReevaluateContext;
  alwaysAffectedOnEntityMatch: boolean;
}

function runReevaluate(args: RunReevaluateArgs): {
  nextResult: ProcessImportOutput;
  affectedCount: number;
} {
  const buckets: BucketAccumulator = {
    matched: [...args.result.matched],
    uncertain: [],
    failed: [],
  };

  const remaining: RemainingItem[] = [
    ...args.result.uncertain.map((tx) => ({ tx, bucket: 'uncertain' as const })),
    ...args.result.failed.map((tx) => ({ tx, bucket: 'failed' as const })),
  ];

  let affectedCount = 0;
  for (let i = 0; i < remaining.length; i++) {
    const item = remaining[i];
    if (!item) continue;
    const changed = processRemainingItem({
      item,
      ctx: args.ctx,
      index: i + 1,
      total: remaining.length,
      buckets,
      alwaysAffectedOnEntityMatch: args.alwaysAffectedOnEntityMatch,
    });
    if (changed) affectedCount += 1;
  }

  return {
    nextResult: {
      ...args.result,
      matched: buckets.matched,
      uncertain: buckets.uncertain,
      failed: buckets.failed,
    },
    affectedCount,
  };
}

export function reevaluateImportSessionResult(args: {
  result: ProcessImportOutput;
  minConfidence: number;
}): { nextResult: ProcessImportOutput; affectedCount: number } {
  const { entityLookup, aliasMap: aliases } = loadEntityMaps();
  return runReevaluate({
    result: args.result,
    ctx: {
      minConfidence: args.minConfidence,
      knownTags: loadKnownTags(),
      entityLookup,
      aliases,
    },
    alwaysAffectedOnEntityMatch: false,
  });
}

/**
 * Re-evaluate import session using merged rules (DB + pending ChangeSets).
 */
export function reevaluateImportSessionWithRules(args: {
  result: ProcessImportOutput;
  minConfidence: number;
  pendingChangeSets: { changeSet: ChangeSet }[];
}): { nextResult: ProcessImportOutput; affectedCount: number } {
  const dbRules = listCorrections(undefined, 50_000, 0).rows;
  const mergedRules =
    args.pendingChangeSets.length > 0
      ? args.pendingChangeSets.reduce(
          (acc, pcs) => applyChangeSetToRules(acc, pcs.changeSet),
          dbRules
        )
      : dbRules;

  const { entityLookup, aliasMap: aliases } = loadEntityMaps();
  return runReevaluate({
    result: args.result,
    ctx: {
      rules: mergedRules,
      minConfidence: args.minConfidence,
      knownTags: loadKnownTags(),
      entityLookup,
      aliases,
    },
    alwaysAffectedOnEntityMatch: true,
  });
}
