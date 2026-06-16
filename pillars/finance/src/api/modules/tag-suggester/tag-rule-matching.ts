/**
 * Tag-rule matching for the tag-suggester. Split from `index.ts` to keep
 * each file under the per-file line cap. Resolves the active
 * `transaction_tag_rules` whose pattern matches a description (exact /
 * contains / regex), scoped to an optional entity.
 */
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';

import {
  type FinanceDb,
  transactionCorrectionsService,
  transactionTagRules,
} from '../../../db/index.js';

export interface TagRuleRow {
  tags: string;
  descriptionPattern: string;
}

function buildEntityFilter(entityId: string | null): ReturnType<typeof or> {
  return entityId !== null
    ? or(isNull(transactionTagRules.entityId), eq(transactionTagRules.entityId, entityId))
    : isNull(transactionTagRules.entityId);
}

export function findMatchingTagRules(
  db: FinanceDb,
  description: string,
  entityId: string | null
): TagRuleRow[] {
  const norm = transactionCorrectionsService.normalizeDescription(description);
  const ef = buildEntityFilter(entityId);
  const cols = {
    tags: transactionTagRules.tags,
    descriptionPattern: transactionTagRules.descriptionPattern,
  };
  const base = and(eq(transactionTagRules.isActive, true), ef);

  const exact = db
    .select(cols)
    .from(transactionTagRules)
    .where(
      and(
        base,
        eq(transactionTagRules.matchType, 'exact'),
        eq(transactionTagRules.descriptionPattern, norm)
      )
    )
    .orderBy(desc(transactionTagRules.confidence))
    .all();

  const contains = db
    .select(cols)
    .from(transactionTagRules)
    .where(
      and(
        base,
        eq(transactionTagRules.matchType, 'contains'),
        sql`${norm} LIKE '%' || upper(${transactionTagRules.descriptionPattern}) || '%'`
      )
    )
    .orderBy(desc(transactionTagRules.confidence))
    .all();

  const regexCandidates = db
    .select(cols)
    .from(transactionTagRules)
    .where(and(base, eq(transactionTagRules.matchType, 'regex')))
    .orderBy(desc(transactionTagRules.confidence))
    .all();

  const regex = regexCandidates.filter((r) => {
    try {
      return new RegExp(r.descriptionPattern, 'i').test(description);
    } catch {
      console.warn(`[tag-rules] invalid regex pattern — skipping rule: ${r.descriptionPattern}`);
      return false;
    }
  });

  return [...exact, ...contains, ...regex];
}
