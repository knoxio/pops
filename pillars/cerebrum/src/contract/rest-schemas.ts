/**
 * Shared zod schemas for the cerebrum ts-rest contract.
 *
 * Kept separate from the per-domain `rest-<domain>.ts` files so the
 * response/error envelope shapes have a single definition reused across
 * domains as later slices land.
 */
import { z } from 'zod';

/**
 * Wire error envelope. Mirrors the inventory/food pillars: `message` is the
 * EN-AU fallback, `messageKey` is the i18n lookup the FE resolves, `code` is
 * the originating error class name.
 */
export const errorBodySchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  messageKey: z.string().optional(),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

const TEMPLATE_FIELD_TYPES = [
  'string',
  'number',
  'boolean',
  'string[]',
  'number[]',
  'boolean[]',
] as const;

export const templateCustomFieldSchema = z.object({
  type: z.enum(TEMPLATE_FIELD_TYPES),
  description: z.string().min(1),
});

/** A template without its Markdown body — the list-view projection. */
export const templateSummarySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  required_fields: z.array(z.string().min(1)).optional(),
  suggested_sections: z.array(z.string().min(1)).optional(),
  default_scopes: z.array(z.string().min(1)).optional(),
  custom_fields: z.record(z.string(), templateCustomFieldSchema).optional(),
});
export type TemplateSummaryWire = z.infer<typeof templateSummarySchema>;

/** A full template, including the raw Markdown body. */
export const templateSchema = templateSummarySchema.extend({
  body: z.string(),
});
export type TemplateWire = z.infer<typeof templateSchema>;

/**
 * Reflex wire schemas (PRD-089). Reflexes are declarative trigger/action rules
 * defined in `reflexes.toml`; the pillar exposes management reads + toggles +
 * a dry-run test + an append-only execution history.
 */
export const reflexTriggerTypeSchema = z.enum(['event', 'threshold', 'schedule']);
export type ReflexTriggerTypeWire = z.infer<typeof reflexTriggerTypeSchema>;

export const reflexExecutionStatusSchema = z.enum([
  'triggered',
  'executing',
  'completed',
  'failed',
]);
export type ReflexExecutionStatusWire = z.infer<typeof reflexExecutionStatusSchema>;

const reflexEventTriggerSchema = z.object({
  type: z.literal('event'),
  event: z.enum(['engram.created', 'engram.modified', 'engram.archived', 'engram.linked']),
  conditions: z
    .object({
      type: z.string().optional(),
      scopes: z.array(z.string()).optional(),
      source: z.string().optional(),
    })
    .optional(),
});

const reflexThresholdTriggerSchema = z.object({
  type: z.literal('threshold'),
  metric: z.enum(['similar_count', 'staleness_max', 'topic_frequency']),
  value: z.number(),
  scopes: z.array(z.string()).optional(),
});

const reflexScheduleTriggerSchema = z.object({
  type: z.literal('schedule'),
  cron: z.string(),
});

export const reflexTriggerSchema = z.discriminatedUnion('type', [
  reflexEventTriggerSchema,
  reflexThresholdTriggerSchema,
  reflexScheduleTriggerSchema,
]);

export const reflexActionSchema = z.object({
  type: z.enum(['ingest', 'emit', 'glia']),
  verb: z.string(),
  template: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  target: z.string().optional(),
});

export const reflexDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  enabled: z.boolean(),
  trigger: reflexTriggerSchema,
  action: reflexActionSchema,
});

/** A reflex enriched with runtime status (last fire, next fire, count). */
export const reflexWithStatusSchema = reflexDefinitionSchema.extend({
  lastExecutionAt: z.string().nullable(),
  nextFireTime: z.string().nullable(),
  executionCount: z.number().int(),
});
export type ReflexWithStatusWire = z.infer<typeof reflexWithStatusSchema>;

/** One row of the append-only reflex execution log. */
export const reflexExecutionSchema = z.object({
  id: z.string(),
  reflexName: z.string(),
  triggerType: reflexTriggerTypeSchema,
  triggerData: z.record(z.string(), z.unknown()).nullable(),
  actionType: z.enum(['ingest', 'emit', 'glia']),
  actionVerb: z.string(),
  status: reflexExecutionStatusSchema,
  result: z.record(z.string(), z.unknown()).nullable(),
  triggeredAt: z.string(),
  completedAt: z.string().nullable(),
});
export type ReflexExecutionWire = z.infer<typeof reflexExecutionSchema>;
