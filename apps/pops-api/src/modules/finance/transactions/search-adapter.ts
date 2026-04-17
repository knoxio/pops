import { like, sql } from 'drizzle-orm';

import { transactions } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { registerSearchAdapter } from '../../core/search/index.js';

import type { Query, SearchAdapter, SearchContext, SearchHit } from '../../core/search/index.js';

export interface TransactionHitData {
  description: string;
  amount: number;
  date: string;
  entityName: string | null;
  type: 'income' | 'expense' | 'transfer';
}

function scoreHit(
  description: string,
  queryText: string
): { score: number; matchType: 'exact' | 'prefix' | 'contains' } | null {
  const lower = description.toLowerCase();
  const query = queryText.toLowerCase();

  if (lower === query) {
    return { score: 1.0, matchType: 'exact' };
  }
  if (lower.startsWith(query)) {
    return { score: 0.8, matchType: 'prefix' };
  }
  if (lower.includes(query)) {
    return { score: 0.5, matchType: 'contains' };
  }
  return null;
}

export const transactionsSearchAdapter: SearchAdapter<TransactionHitData> = {
  domain: 'transactions',
  icon: 'ArrowRightLeft',
  color: 'green',

  search(
    query: Query,
    _context: SearchContext,
    options?: { limit?: number }
  ): SearchHit<TransactionHitData>[] {
    const text = query.text.trim();
    if (!text) return [];

    const db = getDrizzle();
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

    const hits: SearchHit<TransactionHitData>[] = [];
    for (const row of rows) {
      const match = scoreHit(row.description, text);
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
          type: row.type as 'income' | 'expense' | 'transfer',
        },
      });
    }

    hits.sort((a, b) => b.score - a.score);

    if (options?.limit && options.limit > 0) {
      return hits.slice(0, options.limit);
    }

    return hits;
  },
};

registerSearchAdapter(transactionsSearchAdapter);
