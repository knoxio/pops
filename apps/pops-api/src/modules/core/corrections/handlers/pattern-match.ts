import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';

import { transactionCorrections } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { ruleMatchesDescription } from '../pure-service.js';
import { classifyCorrectionMatch, normalizeDescription } from '../types.js';

import type { CorrectionMatchResult, CorrectionRow } from '../types.js';

export function findAllMatchingCorrectionFromDB(
  description: string,
  minConfidence: number = 0.7
): CorrectionRow[] {
  const db = getDrizzle();
  const normalized = normalizeDescription(description);

  const candidates = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        gte(transactionCorrections.confidence, minConfidence)
      )
    )
    .orderBy(asc(transactionCorrections.priority), asc(transactionCorrections.id))
    .all();

  return candidates.filter((rule) => ruleMatchesDescription(rule, normalized));
}

export function findMatchingCorrection(
  description: string,
  minConfidence: number = 0.7
): CorrectionMatchResult | null {
  const allMatches = findAllMatchingCorrectionFromDB(description, minConfidence);
  const first = allMatches[0];
  if (!first) return null;
  return classifyCorrectionMatch(first);
}

export function findAllMatchingCorrections(description: string): CorrectionRow[] {
  const db = getDrizzle();
  const normalized = normalizeDescription(description);

  const exactMatches = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        eq(transactionCorrections.matchType, 'exact'),
        eq(transactionCorrections.descriptionPattern, normalized)
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const containsMatches = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        eq(transactionCorrections.matchType, 'contains'),
        sql`${normalized} LIKE '%' || ${transactionCorrections.descriptionPattern} || '%'`
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const regexCandidates = db
    .select()
    .from(transactionCorrections)
    .where(
      and(eq(transactionCorrections.isActive, true), eq(transactionCorrections.matchType, 'regex'))
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const regexMatches: CorrectionRow[] = [];
  for (const row of regexCandidates) {
    try {
      if (new RegExp(row.descriptionPattern).test(normalized)) {
        regexMatches.push(row);
      }
    } catch {
      // ignore invalid regex
    }
  }

  return [...exactMatches, ...containsMatches, ...regexMatches];
}
