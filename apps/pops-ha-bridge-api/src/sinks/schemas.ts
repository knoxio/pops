/**
 * PRD-237 US-02: runtime Zod schemas for inbound sink payloads.
 *
 * The mapping config (`./mapping.ts`) declares the JSON-Schema-shaped
 * payload contract used in the manifest projection. The orchestrator
 * (PRD-236) and the inbound `POST /_sinks/<eventType>` endpoint both
 * need a live Zod instance to validate against — this module is the
 * single source of truth for those schemas, keyed by the same
 * `eventType` strings the mapping uses.
 *
 * Keeping the Zod registry next to the mapping (but in a separate file)
 * lets US-02 ship validation without mutating US-01's shipped config.
 */
import { z } from 'zod';

export const sinkPayloadSchemas = {
  'media.watch.completed': z
    .object({
      mediaId: z.string(),
      userId: z.string(),
      occurredAt: z.string(),
      durationSeconds: z.number().optional(),
    })
    .strict(),
  'finance.balance.low': z
    .object({
      accountId: z.string(),
      balance: z.number(),
      threshold: z.number(),
      currency: z.string().optional(),
      occurredAt: z.string(),
    })
    .strict(),
  'inventory.item.consumed': z
    .object({
      itemId: z.string(),
      quantity: z.number(),
      unit: z.string().optional(),
      occurredAt: z.string(),
    })
    .strict(),
  'ha.notify.send': z
    .object({
      service: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z][a-z0-9_]*$/, 'service must be lowercase snake_case')
        .optional(),
      message: z.string().min(1),
      title: z.string().min(1).optional(),
      target: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
      data: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  'ha.event.fire': z
    .object({
      eventType: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[a-z][a-z0-9_]*$/, 'eventType must be lowercase snake_case'),
      eventData: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
} as const;

export type SinkPayloadSchemaMap = typeof sinkPayloadSchemas;

export function getSinkPayloadSchema(eventType: string): z.ZodType<unknown> | undefined {
  if (!Object.prototype.hasOwnProperty.call(sinkPayloadSchemas, eventType)) return undefined;
  return sinkPayloadSchemas[eventType as keyof SinkPayloadSchemaMap];
}
