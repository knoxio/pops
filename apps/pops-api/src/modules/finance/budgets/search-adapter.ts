import { like } from 'drizzle-orm';

import { budgets } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { registerSearchAdapter } from '../../core/search/index.js';

import type { Query, SearchAdapter, SearchContext, SearchHit } from '../../core/search/index.js';

export interface BudgetHitData {
  category: string;
  period: string | null;
  amount: number | null;
}

function scoreHit(
  category: string,
  query: string
): { score: number; matchType: 'exact' | 'prefix' | 'contains' } | null {
  const lower = category.toLowerCase();
  const q = query.toLowerCase();

  if (lower === q) return { score: 1.0, matchType: 'exact' };
  if (lower.startsWith(q)) return { score: 0.8, matchType: 'prefix' };
  if (lower.includes(q)) return { score: 0.5, matchType: 'contains' };
  return null;
}

export const budgetsSearchAdapter: SearchAdapter<BudgetHitData> = {
  domain: 'budgets',
  icon: 'PiggyBank',
  color: 'green',

  search(
    query: Query,
    _context: SearchContext,
    options?: { limit?: number }
  ): SearchHit<BudgetHitData>[] {
    const text = query.text.trim();
    if (!text) return [];

    const db = getDrizzle();
    const limit = options?.limit ?? 20;

    const rows = db
      .select()
      .from(budgets)
      .where(like(budgets.category, `%${text}%`))
      .limit(limit)
      .all();

    const hits: SearchHit<BudgetHitData>[] = [];

    for (const row of rows) {
      const match = scoreHit(row.category, text);
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
  },
};

registerSearchAdapter(budgetsSearchAdapter);
