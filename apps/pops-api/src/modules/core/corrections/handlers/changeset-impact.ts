import { sql } from 'drizzle-orm';

import { transactionCorrections, transactions } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { parseJsonStringArray } from '../../../../shared/json.js';
import {
  applyChangeSetToRules,
  computeImpactCounts,
  findMatchingCorrectionFromRules,
  mergeTags,
  outcomeChanged,
  outcomeFromMatch,
} from '../pure-service.js';

import type {
  ChangeSet,
  ChangeSetImpactCounts,
  ChangeSetImpactItem,
  CorrectionClassificationOutcome,
  CorrectionRow,
} from '../types.js';

interface CandidateTransaction {
  id: string;
  description: string;
  type: string | null;
  tags: string | null;
  entityId: string | null;
  entityName: string | null;
  location: string | null;
}

function fetchCandidates(
  matchType: 'exact' | 'contains' | 'regex',
  normalizedPattern: string,
  maxPreviewItems: number
): CandidateTransaction[] {
  const sqlNormalizedDescription = sql`upper(${transactions.description})`;
  const sqlNoDigits = sql`replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(${sqlNormalizedDescription}, '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '')`;
  const sqlCollapsedSpaces = sql`replace(replace(replace(${sqlNoDigits}, '  ', ' '), '  ', ' '), '  ', ' ')`;
  const sqlPrefilterExpression =
    matchType === 'regex' ? sqlNormalizedDescription : sqlCollapsedSpaces;

  return getDrizzle()
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
        : sql`${sqlPrefilterExpression} LIKE '%' || ${normalizedPattern} || '%'`
    )
    .limit(maxPreviewItems)
    .all() as CandidateTransaction[];
}

function withTagsMerged(
  base: CorrectionClassificationOutcome,
  txTags: string[]
): CorrectionClassificationOutcome {
  return { ...base, tags: mergeTags(txTags, base.tags).toSorted() };
}

function buildImpactItem(
  candidate: CandidateTransaction,
  rulesBefore: CorrectionRow[],
  rulesAfter: CorrectionRow[],
  minConfidence: number
): ChangeSetImpactItem | null {
  const matchBefore = findMatchingCorrectionFromRules(
    candidate.description,
    rulesBefore,
    minConfidence
  );
  const matchAfter = findMatchingCorrectionFromRules(
    candidate.description,
    rulesAfter,
    minConfidence
  );

  const txTags = parseJsonStringArray(candidate.tags);
  const before = withTagsMerged(outcomeFromMatch(matchBefore), txTags);
  const after = withTagsMerged(outcomeFromMatch(matchAfter), txTags);

  if (!outcomeChanged(before, after)) return null;

  return {
    transactionId: candidate.id,
    description: candidate.description,
    before,
    after,
  };
}

export interface ImpactPreviewArgs {
  changeSet: ChangeSet;
  matchType: 'exact' | 'contains' | 'regex';
  normalizedPattern: string;
  minConfidence: number;
  maxPreviewItems: number;
}

export function computeChangeSetImpact(args: ImpactPreviewArgs): {
  affected: ChangeSetImpactItem[];
  counts: ChangeSetImpactCounts;
  rulesBefore: CorrectionRow[];
} {
  const candidates = fetchCandidates(args.matchType, args.normalizedPattern, args.maxPreviewItems);
  const rulesBefore = getDrizzle().select().from(transactionCorrections).all();
  const rulesAfter = applyChangeSetToRules(rulesBefore, args.changeSet);

  const affected: ChangeSetImpactItem[] = [];
  for (const t of candidates) {
    const item = buildImpactItem(t, rulesBefore, rulesAfter, args.minConfidence);
    if (item) affected.push(item);
  }

  return { affected, counts: computeImpactCounts(affected), rulesBefore };
}
