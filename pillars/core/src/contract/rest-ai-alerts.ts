/**
 * `ai-alerts.*` sub-router — AI alert rules + fired alerts (PRD-092 US-07).
 *
 * The legacy tRPC router nests a `rules` sub-router plus top-level
 * list/acknowledge/runNow. Mapping:
 *
 *   rules.list        (query)               → GET    /ai-alerts/rules
 *   rules.seedDefaults(mutation, no input)  → POST   /ai-alerts/rules/seed-defaults
 *   rules.get         (query, id)           → GET    /ai-alerts/rules/:id
 *   rules.create      (mutation, body)      → POST   /ai-alerts/rules
 *   rules.update      (mutation, id+body)   → PATCH  /ai-alerts/rules/:id
 *   rules.setEnabled  (mutation, id+enabled)→ PATCH  /ai-alerts/rules/:id/enabled
 *   rules.delete      (mutation, id)        → DELETE /ai-alerts/rules/:id
 *   list              (query, filters)      → GET    /ai-alerts
 *   acknowledge       (mutation, id)        → POST   /ai-alerts/:id/acknowledge
 *   runNow            (mutation, no input)  → POST   /ai-alerts/run
 *
 * Non-obvious choices:
 *   - `seedDefaults` is declared BEFORE `get`/`update`/`delete` so its literal
 *     `/rules/seed-defaults` path is registered ahead of the `/rules/:id`
 *     param route and wins the match (ts-rest registers in contract-key order).
 *   - `update`/`setEnabled` move `id` from the tRPC body into the path; the
 *     handler merges the path id back into the service input.
 *   - `rules.get` and `acknowledge` returned `null` → `NOT_FOUND` in tRPC; the
 *     handlers throw `NotFoundError` → 404 to preserve that contract.
 *   - the `acknowledged` list filter is a boolean; on the wire it arrives as a
 *     string, so it's modelled as a `'true' | 'false'` enum the handler coerces.
 *
 * Output shapes mirror `ai-alerts/types.ts` + the service/evaluator returns.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, LimitQuery, OffsetQuery } from './rest-schemas.js';

const c = initContract();

const AlertRuleType = z.enum(['budget-threshold', 'error-spike', 'latency-degradation']);
const AlertSeverity = z.enum(['warning', 'critical']);
const AlertChannel = z.enum(['telegram', 'nudge']);

/** Mirrors `AlertRule` in `ai-alerts/types.ts`. */
const AlertRuleSchema = z.object({
  id: z.number(),
  type: AlertRuleType,
  scopeProvider: z.string().nullable(),
  scopeModel: z.string().nullable(),
  thresholdValue: z.number(),
  windowMinutes: z.number().nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Mirrors `FiredAlert` in `ai-alerts/types.ts`. */
const FiredAlertSchema = z.object({
  id: z.number(),
  ruleId: z.number().nullable(),
  type: AlertRuleType,
  message: z.string(),
  severity: AlertSeverity,
  scopeDetail: z.string().nullable(),
  metricValue: z.number(),
  thresholdValue: z.number(),
  acknowledged: z.boolean(),
  acknowledgedAt: z.string().nullable(),
  createdAt: z.string(),
});

/** Mirrors `DispatchedAlert` (FiredAlert + delivered channels). */
const DispatchedAlertSchema = FiredAlertSchema.extend({
  channels: z.array(AlertChannel),
});

/** Mirrors `RunEvaluationResult` in `ai-alerts/evaluator.ts`. */
const RunEvaluationResultSchema = z.object({
  rulesEvaluated: z.number(),
  candidates: z.number(),
  deduped: z.number(),
  alerts: z.array(DispatchedAlertSchema),
});

const CreateRuleBody = z.object({
  type: AlertRuleType,
  scopeProvider: z.string().min(1).nullable().optional(),
  scopeModel: z.string().min(1).nullable().optional(),
  thresholdValue: z.number().positive(),
  windowMinutes: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
});

const UpdateRuleBody = z.object({
  type: AlertRuleType.optional(),
  scopeProvider: z.string().min(1).nullable().optional(),
  scopeModel: z.string().min(1).nullable().optional(),
  thresholdValue: z.number().positive().optional(),
  windowMinutes: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
});

const ListAlertsQuery = z.object({
  acknowledged: z.enum(['true', 'false']).optional(),
  type: AlertRuleType.optional(),
  severity: AlertSeverity.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: LimitQuery,
  offset: OffsetQuery,
});

const RuleIdParam = z.object({ id: z.coerce.number().int().positive() });

export const coreAiAlertsContract = c.router({
  listRules: {
    method: 'GET',
    path: '/ai-alerts/rules',
    responses: { 200: z.array(AlertRuleSchema) },
    summary: 'List AI alert rules',
  },
  seedDefaultRules: {
    method: 'POST',
    path: '/ai-alerts/rules/seed-defaults',
    body: z.object({}).optional(),
    responses: { 200: z.object({ created: z.number() }) },
    summary: 'Idempotently seed the default AI alert rules',
  },
  getRule: {
    method: 'GET',
    path: '/ai-alerts/rules/:id',
    pathParams: RuleIdParam,
    responses: { 200: AlertRuleSchema, ...ERR_RESPONSES },
    summary: 'Get a single AI alert rule',
  },
  createRule: {
    method: 'POST',
    path: '/ai-alerts/rules',
    body: CreateRuleBody,
    responses: { 200: AlertRuleSchema, ...ERR_RESPONSES },
    summary: 'Create an AI alert rule',
  },
  updateRule: {
    method: 'PATCH',
    path: '/ai-alerts/rules/:id',
    pathParams: RuleIdParam,
    body: UpdateRuleBody,
    responses: { 200: AlertRuleSchema, ...ERR_RESPONSES },
    summary: 'Update an AI alert rule',
  },
  setRuleEnabled: {
    method: 'PATCH',
    path: '/ai-alerts/rules/:id/enabled',
    pathParams: RuleIdParam,
    body: z.object({ enabled: z.boolean() }),
    responses: { 200: AlertRuleSchema, ...ERR_RESPONSES },
    summary: 'Enable or disable an AI alert rule',
  },
  deleteRule: {
    method: 'DELETE',
    path: '/ai-alerts/rules/:id',
    pathParams: RuleIdParam,
    body: z.object({}).optional(),
    responses: { 200: z.object({ success: z.boolean() }), ...ERR_RESPONSES },
    summary: 'Delete an AI alert rule',
  },
  list: {
    method: 'GET',
    path: '/ai-alerts',
    query: ListAlertsQuery,
    responses: { 200: z.object({ alerts: z.array(FiredAlertSchema), total: z.number() }) },
    summary: 'List fired alerts with optional filters and pagination',
  },
  acknowledge: {
    method: 'POST',
    path: '/ai-alerts/:id/acknowledge',
    pathParams: RuleIdParam,
    body: z.object({}).optional(),
    responses: { 200: FiredAlertSchema, ...ERR_RESPONSES },
    summary: 'Acknowledge a fired alert',
  },
  runNow: {
    method: 'POST',
    path: '/ai-alerts/run',
    body: z.object({}).optional(),
    responses: { 200: RunEvaluationResultSchema },
    summary: 'Run the AI alert evaluation cycle now',
  },
});
