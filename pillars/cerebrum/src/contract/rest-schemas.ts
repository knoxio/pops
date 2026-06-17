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

const PLEXUS_ADAPTER_STATUSES = [
  'registered',
  'initializing',
  'healthy',
  'degraded',
  'error',
  'shutdown',
] as const;

const PLEXUS_FILTER_TYPES = ['include', 'exclude'] as const;

/** A registered plexus adapter row (config envelope passed through opaque). */
export const plexusAdapterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(PLEXUS_ADAPTER_STATUSES),
  config: z.record(z.string(), z.unknown()).nullable(),
  lastHealth: z.string().nullable(),
  lastError: z.string().nullable(),
  ingestedCount: z.number().int(),
  emittedCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlexusAdapterWire = z.infer<typeof plexusAdapterSchema>;

/** A persisted per-adapter ingestion filter. */
export const plexusFilterSchema = z.object({
  id: z.string().min(1),
  adapterId: z.string().min(1),
  filterType: z.enum(PLEXUS_FILTER_TYPES),
  field: z.string().min(1),
  pattern: z.string().min(1),
  enabled: z.boolean(),
});
export type PlexusFilterWire = z.infer<typeof plexusFilterSchema>;

/** A filter definition supplied by the caller (id generated server-side). */
export const plexusFilterDefinitionSchema = z.object({
  filterType: z.enum(PLEXUS_FILTER_TYPES),
  field: z.string().min(1),
  pattern: z.string().min(1),
  enabled: z.boolean().optional(),
});
export type PlexusFilterDefinitionWire = z.infer<typeof plexusFilterDefinitionSchema>;

/** Result of a manual health-check run against an adapter. */
export const plexusHealthResultSchema = z.object({
  status: z.enum(PLEXUS_ADAPTER_STATUSES),
  lastCheck: z.string(),
  error: z.string().optional(),
});
export type PlexusHealthResultWire = z.infer<typeof plexusHealthResultSchema>;

/** Result of a manual sync run against an adapter. */
export const plexusSyncResultSchema = z.object({
  ingested: z.number().int(),
  filtered: z.number().int(),
});
export type PlexusSyncResultWire = z.infer<typeof plexusSyncResultSchema>;
