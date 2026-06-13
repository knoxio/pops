/**
 * previewMatches handler — given a candidate (pattern, matchType), returns the
 * transactions in the DB whose descriptions would be matched by that rule.
 *
 * The query mirrors `ruleMatchesDescription` semantics:
 *   - both pattern and description go through normalizeDescription
 *   - `regex` is interpreted case-insensitively against the normalized
 *     description so it matches the production matcher exactly.
 *
 * The procedure is intentionally pattern-only: it does NOT consider the
 * stored `priority` / `confidence` of any rule, because the caller wants to
 * preview a hypothetical edit before persisting it. To exclude the rule
 * being edited from a "would this rule still match the same set?" check,
 * the caller can simply pass the proposed pattern directly.
 */
import { desc } from 'drizzle-orm';

import { transactions } from '@pops/db-types';

import { getFinanceDrizzle } from '../../../../db/finance-handle.js';
import { parseJsonStringArray } from '../../../../shared/json.js';
import { patternMatchesDescription } from '../lib/pattern-match.js';

import type { TransactionRow } from '@pops/db-types';

export type RuleMatchType = 'exact' | 'contains' | 'regex';

export interface PreviewMatchInput {
  descriptionPattern: string;
  matchType: RuleMatchType;
  /** Hard cap on rows returned to the client. */
  limit?: number;
}

export interface PreviewMatchTransaction {
  id: string;
  description: string;
  account: string;
  amount: number;
  date: string;
  entityName: string | null;
  tags: string[];
}

export interface PreviewMatchResult {
  matches: PreviewMatchTransaction[];
  total: number;
  scanned: number;
  truncated: boolean;
}

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 200;

function toMatchTransaction(row: TransactionRow): PreviewMatchTransaction {
  return {
    id: row.id,
    description: row.description,
    account: row.account,
    amount: row.amount,
    date: row.date,
    entityName: row.entityName,
    tags: parseJsonStringArray(row.tags),
  };
}

/**
 * Run the candidate rule against every transaction in the DB and collect
 * matching rows. The matcher is pure JS (mirrors production semantics) so
 * the same logic works for `exact`, `contains`, and `regex` without dialect
 * gymnastics in SQL.
 *
 * The match is computed in JS because the production matcher already runs
 * in JS at categorise/apply time — pushing the same logic into SQL would
 * require keeping two implementations in lockstep. With a small SQLite store
 * scanning all transactions is well within budget.
 */
export function previewMatches(input: PreviewMatchInput): PreviewMatchResult {
  const limit = Math.min(input.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
  const db = getFinanceDrizzle();

  const rows = db.select().from(transactions).orderBy(desc(transactions.date)).all();

  const matched: TransactionRow[] = [];
  for (const row of rows) {
    if (patternMatchesDescription(input.descriptionPattern, input.matchType, row.description)) {
      matched.push(row);
    }
  }

  const truncated = matched.length > limit;
  const sliced = truncated ? matched.slice(0, limit) : matched;

  return {
    matches: sliced.map(toMatchTransaction),
    total: matched.length,
    scanned: rows.length,
    truncated,
  };
}
