/**
 * Bulk spend aggregation for budget rows.
 *
 * Issues one `SELECT … GROUP BY tag` query per unique `period` (windows
 * differ per period), instead of one query per budget row. Drives both
 * the list endpoint and the per-row helpers so spend semantics stay in
 * one place.
 */
import { and, sql } from 'drizzle-orm';

import { transactions } from '../schema.js';
import { periodWindowEnd, periodWindowStart } from './period-window.js';

import type { FinanceDb } from './internal.js';

const NULL_PERIOD_KEY = '__null__';

/** Map key encoding for `(period, category)`. Null periods get a sentinel. */
export function spendMapKey(period: string | null, category: string): string {
  return `${period ?? NULL_PERIOD_KEY}|${category}`;
}

export interface BudgetTarget {
  category: string;
  period: string | null;
}

interface SpendRow {
  category: string;
  spent: number | null;
}

/**
 * Aggregate per-category spend for a set of budget targets in bulk.
 *
 * Returns a `Map` keyed by `spendMapKey(period, category)`. Missing
 * entries mean zero spend.
 */
export function bulkComputeSpend(
  db: FinanceDb,
  targets: ReadonlyArray<BudgetTarget>,
  now: Date
): Map<string, number> {
  const result = new Map<string, number>();
  if (targets.length === 0) return result;

  const groups = new Map<string, { period: string | null; categories: Set<string> }>();
  for (const target of targets) {
    const groupKey = target.period ?? NULL_PERIOD_KEY;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.categories.add(target.category);
    } else {
      groups.set(groupKey, {
        period: target.period,
        categories: new Set([target.category]),
      });
    }
  }

  for (const { period, categories } of groups.values()) {
    if (categories.size === 0) continue;
    const categoryList = Array.from(categories);

    const conditions = [
      sql`${transactions.type} != 'Transfer'`,
      sql`je.value IN (${sql.join(
        categoryList.map((c) => sql`${c}`),
        sql`, `
      )})`,
    ];

    const windowStart = periodWindowStart(period, now);
    if (windowStart !== null) {
      const windowEnd = periodWindowEnd(now);
      conditions.push(sql`${transactions.date} >= ${windowStart}`);
      conditions.push(sql`${transactions.date} <= ${windowEnd}`);
    }

    const rows = db.all<SpendRow>(sql`
      SELECT je.value AS category,
             SUM(CASE WHEN ${transactions.amount} < 0 THEN -${transactions.amount} ELSE 0 END) AS spent
      FROM ${transactions}, json_each(${transactions.tags}) AS je
      WHERE ${and(...conditions)}
      GROUP BY je.value
    `);

    for (const row of rows) {
      result.set(spendMapKey(period, row.category), row.spent ?? 0);
    }
  }

  return result;
}
