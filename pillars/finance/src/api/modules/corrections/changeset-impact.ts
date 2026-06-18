/**
 * DB-scanning ChangeSet impact preview for the propose flow — finds candidate
 * transactions matching the rule pattern (SQL prefilter mirroring the monolith
 * normalizer) and diffs their before/after correction outcome. Ported from the
 * monolith `core/corrections/{changeset-impact,preview-helpers}.ts`, rewritten
 * onto a `FinanceDb` handle.
 */
import { sql } from 'drizzle-orm';

import { type FinanceDb, transactionCorrections, transactions } from '../../../db/index.js';
import { applyChangeSetToRules, findMatchingCorrectionFromRules } from './pure.js';
import { parseCorrectionTags, type CorrectionMatchResult, type CorrectionRow } from './types.js';

import type { ChangeSet } from '../../../contract/rest-corrections.js';
import type {
  ChangeSetImpactCounts,
  ChangeSetImpactItem,
  CorrectionClassificationOutcome,
} from './ai-types.js';

interface CandidateTransaction {
  id: string;
  description: string;
  tags: string | null;
}

function fetchCandidates(
  db: FinanceDb,
  matchType: 'exact' | 'contains' | 'regex',
  normalizedPattern: string,
  maxPreviewItems: number
): CandidateTransaction[] {
  const upper = sql`upper(${transactions.description})`;
  const noDigits = sql`replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(${upper}, '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '')`;
  const collapsed = sql`replace(replace(replace(${noDigits}, '  ', ' '), '  ', ' '), '  ', ' ')`;
  const prefilter = matchType === 'regex' ? upper : collapsed;

  return db
    .select({ id: transactions.id, description: transactions.description, tags: transactions.tags })
    .from(transactions)
    .where(
      matchType === 'regex' ? undefined : sql`${prefilter} LIKE '%' || ${normalizedPattern} || '%'`
    )
    .limit(maxPreviewItems)
    .all();
}

function outcomeFromMatch(match: CorrectionMatchResult | null): CorrectionClassificationOutcome {
  if (!match) {
    return {
      ruleId: null,
      entityId: null,
      entityName: null,
      location: null,
      tags: [],
      transactionType: null,
    };
  }
  const r = match.correction;
  return {
    ruleId: r.id,
    entityId: r.entityId ?? null,
    entityName: r.entityName ?? null,
    location: r.location ?? null,
    tags: parseCorrectionTags(r.tags),
    transactionType: r.transactionType ?? null,
  };
}

function mergeTags(base: string[], add: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...base, ...add]) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function tagsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => b[i] === t);
}

function outcomeChanged(
  a: CorrectionClassificationOutcome,
  b: CorrectionClassificationOutcome
): boolean {
  return (
    a.ruleId !== b.ruleId ||
    a.entityId !== b.entityId ||
    a.entityName !== b.entityName ||
    a.location !== b.location ||
    a.transactionType !== b.transactionType ||
    !tagsEqual(a.tags, b.tags)
  );
}

function computeImpactCounts(items: ChangeSetImpactItem[]): ChangeSetImpactCounts {
  let entityChanges = 0;
  let locationChanges = 0;
  let tagChanges = 0;
  let typeChanges = 0;
  for (const item of items) {
    if (
      item.before.entityId !== item.after.entityId ||
      item.before.entityName !== item.after.entityName
    ) {
      entityChanges += 1;
    }
    if (item.before.location !== item.after.location) locationChanges += 1;
    if (item.before.transactionType !== item.after.transactionType) typeChanges += 1;
    if (!tagsEqual(item.before.tags, item.after.tags)) tagChanges += 1;
  }
  return { affected: items.length, entityChanges, locationChanges, tagChanges, typeChanges };
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
  const txTags = parseCorrectionTags(candidate.tags ?? '[]');
  const before = withTagsMerged(
    outcomeFromMatch(
      findMatchingCorrectionFromRules(candidate.description, rulesBefore, minConfidence)
    ),
    txTags
  );
  const after = withTagsMerged(
    outcomeFromMatch(
      findMatchingCorrectionFromRules(candidate.description, rulesAfter, minConfidence)
    ),
    txTags
  );
  if (!outcomeChanged(before, after)) return null;
  return { transactionId: candidate.id, description: candidate.description, before, after };
}

export interface ImpactPreviewArgs {
  changeSet: ChangeSet;
  matchType: 'exact' | 'contains' | 'regex';
  normalizedPattern: string;
  minConfidence: number;
  maxPreviewItems: number;
}

export function computeChangeSetImpact(
  db: FinanceDb,
  args: ImpactPreviewArgs
): {
  affected: ChangeSetImpactItem[];
  counts: ChangeSetImpactCounts;
  rulesBefore: CorrectionRow[];
} {
  const candidates = fetchCandidates(
    db,
    args.matchType,
    args.normalizedPattern,
    args.maxPreviewItems
  );
  const rulesBefore = db.select().from(transactionCorrections).all();
  const rulesAfter = applyChangeSetToRules(rulesBefore, args.changeSet);

  const affected: ChangeSetImpactItem[] = [];
  for (const c of candidates) {
    const item = buildImpactItem(c, rulesBefore, rulesAfter, args.minConfidence);
    if (item) affected.push(item);
  }
  return { affected, counts: computeImpactCounts(affected), rulesBefore };
}
