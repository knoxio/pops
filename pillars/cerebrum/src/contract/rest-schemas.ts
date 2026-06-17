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
