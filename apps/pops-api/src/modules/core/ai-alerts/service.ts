/**
 * CRUD service for `ai_alert_rules` (PRD-092 US-07).
 *
 * Exposes pure functions used by the tRPC router and seeding scripts.
 *
 * Reads + writes resolve against `getCoreDrizzle()` now that PRD-186 PR 4
 * lands `ai_alert_rules` in `@pops/core-db`.
 */
import { eq } from 'drizzle-orm';

import { aiAlertRules } from '@pops/db-types';

import { getCoreDrizzle } from '../../../db.js';
import { ruleRowToRule } from './mappers.js';

import type { AlertRule, AlertRuleType } from './types.js';

export interface CreateAlertRuleInput {
  type: AlertRuleType;
  scopeProvider?: string | null;
  scopeModel?: string | null;
  thresholdValue: number;
  windowMinutes?: number | null;
  enabled?: boolean;
}

export interface UpdateAlertRuleInput {
  id: number;
  type?: AlertRuleType;
  scopeProvider?: string | null;
  scopeModel?: string | null;
  thresholdValue?: number;
  windowMinutes?: number | null;
  enabled?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function listRules(): AlertRule[] {
  return getCoreDrizzle().select().from(aiAlertRules).all().map(ruleRowToRule);
}

export function getRule(id: number): AlertRule | null {
  const [row] = getCoreDrizzle().select().from(aiAlertRules).where(eq(aiAlertRules.id, id)).all();
  return row ? ruleRowToRule(row) : null;
}

export function createRule(input: CreateAlertRuleInput): AlertRule {
  const now = nowIso();
  const db = getCoreDrizzle();
  const result = db
    .insert(aiAlertRules)
    .values({
      type: input.type,
      scopeProvider: input.scopeProvider ?? null,
      scopeModel: input.scopeModel ?? null,
      thresholdValue: input.thresholdValue,
      windowMinutes: input.windowMinutes ?? null,
      enabled: input.enabled === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .all();
  const row = result[0];
  if (!row) throw new Error('Insert into ai_alert_rules returned no rows');
  return ruleRowToRule(row);
}

/**
 * Apply a partial update as a single SQL UPDATE. We deliberately avoid a
 * read-then-write merge so concurrent edits (including `setRuleEnabled`)
 * cannot silently clobber fields the caller did not intend to modify.
 */
export function updateRule(input: UpdateAlertRuleInput): AlertRule {
  const now = nowIso();
  const db = getCoreDrizzle();
  const patch: Partial<typeof aiAlertRules.$inferInsert> = { updatedAt: now };
  if (input.type !== undefined) patch.type = input.type;
  if (input.scopeProvider !== undefined) patch.scopeProvider = input.scopeProvider;
  if (input.scopeModel !== undefined) patch.scopeModel = input.scopeModel;
  if (input.thresholdValue !== undefined) patch.thresholdValue = input.thresholdValue;
  if (input.windowMinutes !== undefined) patch.windowMinutes = input.windowMinutes;
  if (input.enabled !== undefined) patch.enabled = input.enabled === false ? 0 : 1;
  const result = db
    .update(aiAlertRules)
    .set(patch)
    .where(eq(aiAlertRules.id, input.id))
    .returning()
    .all();
  const row = result[0];
  if (!row) throw new Error(`Alert rule not found: ${input.id}`);
  return ruleRowToRule(row);
}

export function setRuleEnabled(id: number, enabled: boolean): AlertRule {
  return updateRule({ id, enabled });
}

export function deleteRule(id: number): { success: boolean } {
  const result = getCoreDrizzle().delete(aiAlertRules).where(eq(aiAlertRules.id, id)).run();
  return { success: result.changes > 0 };
}

/**
 * Idempotently seed default alert rules per PRD-092 US-07.
 *
 * Returns the number of rules created. Only types that are not already
 * represented in the table are inserted, so the function can backfill a
 * missing default after a partial earlier seed. The inserts run inside a
 * single transaction so a failure rolls back the whole batch rather than
 * leaving the table in a partially-seeded state.
 */
export function seedDefaultRules(): number {
  const defaults: CreateAlertRuleInput[] = [
    { type: 'budget-threshold', thresholdValue: 80 },
    { type: 'error-spike', thresholdValue: 10, windowMinutes: 60 },
    { type: 'latency-degradation', thresholdValue: 10_000, windowMinutes: 60 },
  ];
  const db = getCoreDrizzle();
  const existingTypes = new Set(listRules().map((r) => r.type));
  const missing = defaults.filter((d) => !existingTypes.has(d.type));
  if (missing.length === 0) return 0;
  const now = nowIso();
  db.transaction((tx) => {
    tx.insert(aiAlertRules)
      .values(
        missing.map((d) => ({
          type: d.type,
          scopeProvider: d.scopeProvider ?? null,
          scopeModel: d.scopeModel ?? null,
          thresholdValue: d.thresholdValue,
          windowMinutes: d.windowMinutes ?? null,
          enabled: d.enabled === false ? 0 : 1,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .run();
  });
  return missing.length;
}
