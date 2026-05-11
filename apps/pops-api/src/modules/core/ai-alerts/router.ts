/**
 * tRPC router for AI alert rules and fired alerts (PRD-092 US-07).
 *
 * Exposed under `core.aiAlerts`:
 *
 *   rules.list / rules.create / rules.update / rules.delete /
 *   rules.setEnabled
 *   list / acknowledge / runNow
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { protectedProcedure, router } from '../../../trpc.js';
import { runEvaluation } from './evaluator.js';
import * as evaluator from './evaluator.js';
import * as service from './service.js';
import { ALERT_RULE_TYPES } from './types.js';

const alertRuleTypeSchema = z.enum(ALERT_RULE_TYPES);

const createInput = z.object({
  type: alertRuleTypeSchema,
  scopeProvider: z.string().min(1).nullable().optional(),
  scopeModel: z.string().min(1).nullable().optional(),
  thresholdValue: z.number().positive(),
  windowMinutes: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
});

const updateInput = z.object({
  id: z.number().int().positive(),
  type: alertRuleTypeSchema.optional(),
  scopeProvider: z.string().min(1).nullable().optional(),
  scopeModel: z.string().min(1).nullable().optional(),
  thresholdValue: z.number().positive().optional(),
  windowMinutes: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
});

const listAlertsInput = z
  .object({
    acknowledged: z.boolean().optional(),
    type: alertRuleTypeSchema.optional(),
    severity: z.enum(['warning', 'critical']).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .optional();

export const aiAlertsRouter = router({
  rules: router({
    list: protectedProcedure.query(() => service.listRules()),
    get: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ input }) => {
        const rule = service.getRule(input.id);
        if (!rule) throw new TRPCError({ code: 'NOT_FOUND', message: 'Alert rule not found' });
        return rule;
      }),
    create: protectedProcedure
      .input(createInput)
      .mutation(({ input }) => service.createRule(input)),
    update: protectedProcedure
      .input(updateInput)
      .mutation(({ input }) => service.updateRule(input)),
    setEnabled: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), enabled: z.boolean() }))
      .mutation(({ input }) => service.setRuleEnabled(input.id, input.enabled)),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => service.deleteRule(input.id)),
    seedDefaults: protectedProcedure.mutation(() => ({ created: service.seedDefaultRules() })),
  }),
  list: protectedProcedure
    .input(listAlertsInput)
    .query(({ input }) => evaluator.listAlerts(input ?? {})),
  acknowledge: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => {
      const alert = evaluator.acknowledgeAlert(input.id);
      if (!alert) throw new TRPCError({ code: 'NOT_FOUND', message: 'Alert not found' });
      return alert;
    }),
  runNow: protectedProcedure.mutation(() => runEvaluation()),
});
