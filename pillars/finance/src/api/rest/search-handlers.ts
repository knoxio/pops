/**
 * Handler for the `search.*` sub-router — finance's slice of unified search.
 *
 * Aggregates three finance adapters, each a `LIKE` candidate scan ranked by
 * exact/prefix/contains scoring against the finance pillar's `FinanceDb`:
 *   - transactions
 *   - budgets (capped at BUDGETS_DEFAULT_LIMIT)
 *   - wishlist
 * Hits from all three are concatenated into one response.
 *
 * `uri` shapes are a cross-pillar contract: the search orchestrator dispatches
 * on them and caches client links keyed by them, so they must stay stable.
 */
import { and, like, sql } from 'drizzle-orm';

import { budgets, type FinanceDb, transactions, wishList } from '../../db/index.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeSearchContract } from '../../contract/rest-search.js';

type Req = ServerInferRequest<typeof financeSearchContract>;

type MatchType = 'exact' | 'prefix' | 'contains';

interface SearchHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: MatchType;
  data: Record<string, unknown>;
}

const BUDGETS_DEFAULT_LIMIT = 20;

function classify(
  value: string,
  queryText: string
): { score: number; matchType: MatchType } | null {
  const lower = value.toLowerCase();
  const q = queryText.toLowerCase();

  if (lower === q) return { score: 1.0, matchType: 'exact' };
  if (lower.startsWith(q)) return { score: 0.8, matchType: 'prefix' };
  if (lower.includes(q)) return { score: 0.5, matchType: 'contains' };
  return null;
}

/**
 * Normalize raw DB type strings to the canonical lowercase union.
 *  - Capitalised variants ('Expense', 'Income', 'Transfer') come from the import pipeline.
 *  - 'purchase' is a legacy synonym for 'expense' still present in stored rows.
 *  - Anything else (including null/undefined coerced to '') falls back to 'expense'.
 */
export function normalizeTransactionType(raw: string): 'income' | 'expense' | 'transfer' {
  switch (raw.toLowerCase()) {
    case 'income':
      return 'income';
    case 'transfer':
      return 'transfer';
    case 'expense':
    case 'purchase':
    default:
      return 'expense';
  }
}

function searchTransactions(db: FinanceDb, text: string): SearchHit[] {
  const rows = db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      date: transactions.date,
      entityName: transactions.entityName,
      type: transactions.type,
    })
    .from(transactions)
    .where(like(sql`lower(${transactions.description})`, `%${text.toLowerCase()}%`))
    .all();

  const hits: SearchHit[] = [];
  for (const row of rows) {
    const match = classify(row.description, text);
    if (!match) continue;

    hits.push({
      uri: `pops:finance/transaction/${row.id}`,
      score: match.score,
      matchField: 'description',
      matchType: match.matchType,
      data: {
        description: row.description,
        amount: row.amount,
        date: row.date,
        entityName: row.entityName,
        type: normalizeTransactionType(row.type),
      },
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits;
}

function searchBudgets(db: FinanceDb, text: string): SearchHit[] {
  const rows = db
    .select()
    .from(budgets)
    .where(like(budgets.category, `%${text}%`))
    .limit(BUDGETS_DEFAULT_LIMIT)
    .all();

  const hits: SearchHit[] = [];
  for (const row of rows) {
    const match = classify(row.category, text);
    if (!match) continue;

    hits.push({
      uri: `/budgets/${row.id}`,
      score: match.score,
      matchField: 'category',
      matchType: match.matchType,
      data: {
        category: row.category,
        period: row.period,
        amount: row.amount,
      },
    });
  }

  return hits.toSorted((a, b) => b.score - a.score);
}

function searchWishlist(db: FinanceDb, text: string): SearchHit[] {
  const lowerText = text.toLowerCase();

  // Exclude already-purchased items (saved >= target_amount). Items with no
  // target_amount stay searchable since there is no completion threshold to
  // compare against. NULL `saved` is treated as 0 via COALESCE so a row with
  // a target but no recorded savings still counts as not-yet-purchased.
  const rows = db
    .select()
    .from(wishList)
    .where(
      and(
        like(sql`lower(${wishList.item})`, `%${lowerText}%`),
        sql`(${wishList.targetAmount} IS NULL OR coalesce(${wishList.saved}, 0) < ${wishList.targetAmount})`
      )
    )
    .all();

  const hits: SearchHit[] = [];
  for (const row of rows) {
    const match = classify(row.item, text);
    if (!match) continue;

    hits.push({
      uri: `/finance/wishlist`,
      score: match.score,
      matchField: 'item',
      matchType: match.matchType,
      data: {
        item: row.item,
        priority: row.priority,
        targetAmount: row.targetAmount,
      },
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits;
}

export function makeSearchHandlers(db: FinanceDb) {
  return {
    search: ({ body }: Req['search']) =>
      runHttp(() => {
        const text = body.query.text.trim();
        if (!text) return { status: 200 as const, body: { hits: [] } };

        const hits: SearchHit[] = [
          ...searchTransactions(db, text),
          ...searchBudgets(db, text),
          ...searchWishlist(db, text),
        ];
        return { status: 200 as const, body: { hits } };
      }),
  };
}
