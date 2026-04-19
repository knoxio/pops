import { and, gte, sql } from 'drizzle-orm';

import { aiBudgets, aiInferenceLog } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

export interface Budget {
  id: string;
  scopeType: string;
  scopeValue: string | null;
  monthlyTokenLimit: number | null;
  monthlyCostLimit: number | null;
  action: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetStatus extends Budget {
  currentTokenUsage: number;
  currentCostUsage: number;
  percentageUsed: number | null;
  projectedExhaustionDate: string | null;
}

export interface UpsertBudgetInput {
  id: string;
  scopeType: 'global' | 'provider' | 'operation';
  scopeValue?: string;
  monthlyTokenLimit?: number;
  monthlyCostLimit?: number;
  action?: 'block' | 'warn' | 'fallback';
}

function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function computeProjectedExhaustion(
  currentUsage: number,
  limit: number,
  monthStartDate: Date
): string | null {
  if (currentUsage <= 0) return null;
  const now = new Date();
  const dayOfMonth = now.getDate();
  const exhaustionDay = limit / (currentUsage / dayOfMonth);
  if (!isFinite(exhaustionDay) || exhaustionDay <= dayOfMonth) return null;
  const year = monthStartDate.getFullYear();
  const month = monthStartDate.getMonth();
  const exhaustionDate = new Date(year, month, Math.ceil(exhaustionDay));
  return exhaustionDate.toISOString().split('T')[0] ?? null;
}

export function listBudgets(): Budget[] {
  return getDrizzle().select().from(aiBudgets).all();
}

export function upsertBudget(input: UpsertBudgetInput): Budget {
  const now = new Date().toISOString();
  const db = getDrizzle();
  db.insert(aiBudgets)
    .values({
      id: input.id,
      scopeType: input.scopeType,
      scopeValue: input.scopeValue ?? null,
      monthlyTokenLimit: input.monthlyTokenLimit ?? null,
      monthlyCostLimit: input.monthlyCostLimit ?? null,
      action: input.action ?? 'warn',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiBudgets.id,
      set: {
        scopeType: input.scopeType,
        scopeValue: input.scopeValue ?? null,
        monthlyTokenLimit: input.monthlyTokenLimit ?? null,
        monthlyCostLimit: input.monthlyCostLimit ?? null,
        action: input.action ?? 'warn',
        updatedAt: now,
      },
    })
    .run();
  const row = db
    .select()
    .from(aiBudgets)
    .where(sql`id = ${input.id}`)
    .get();
  if (!row) throw new Error(`Budget not found: ${input.id}`);
  return row;
}

export function getBudgetStatus(): BudgetStatus[] {
  const db = getDrizzle();
  const budgets = db.select().from(aiBudgets).all();
  const start = monthStart();
  const monthStartDate = new Date(start);

  return budgets.map((budget) => {
    const conditions = [gte(aiInferenceLog.createdAt, start)];
    if (budget.scopeType === 'provider' && budget.scopeValue) {
      conditions.push(sql`${aiInferenceLog.provider} = ${budget.scopeValue}`);
    } else if (budget.scopeType === 'operation' && budget.scopeValue) {
      conditions.push(sql`${aiInferenceLog.operation} = ${budget.scopeValue}`);
    }

    const [agg] = db
      .select({
        totalTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.inputTokens} + ${aiInferenceLog.outputTokens}), 0)`,
        totalCost: sql<number>`COALESCE(SUM(${aiInferenceLog.costUsd}), 0)`,
      })
      .from(aiInferenceLog)
      .where(and(...conditions))
      .all();

    const currentTokenUsage = agg?.totalTokens ?? 0;
    const currentCostUsage = agg?.totalCost ?? 0;

    let percentageUsed: number | null = null;
    let projectedExhaustionDate: string | null = null;

    if (budget.monthlyCostLimit != null && budget.monthlyCostLimit > 0) {
      percentageUsed = (currentCostUsage / budget.monthlyCostLimit) * 100;
      projectedExhaustionDate = computeProjectedExhaustion(
        currentCostUsage,
        budget.monthlyCostLimit,
        monthStartDate
      );
    } else if (budget.monthlyTokenLimit != null && budget.monthlyTokenLimit > 0) {
      percentageUsed = (currentTokenUsage / budget.monthlyTokenLimit) * 100;
      projectedExhaustionDate = computeProjectedExhaustion(
        currentTokenUsage,
        budget.monthlyTokenLimit,
        monthStartDate
      );
    }

    return {
      ...budget,
      currentTokenUsage,
      currentCostUsage,
      percentageUsed,
      projectedExhaustionDate,
    };
  });
}
