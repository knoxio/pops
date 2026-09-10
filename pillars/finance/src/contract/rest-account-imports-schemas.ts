/**
 * Wire schemas for what an account knows about its own imports (POPS-2917,
 * finance ADR-003): the batches that fed it, the config that says how it is fed, and
 * the one-line status every accounts response carries.
 */
import { z } from 'zod';

import { IMPORT_PROVIDERS, IMPORT_SOURCE_KINDS, ImportSourceSchema } from './import-source.js';
import { LimitQuery } from './rest-schemas.js';

/** One `import_batches` row as `GET /accounts/:id/imports` serves it. */
export const ImportBatchSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  sourceKind: z.enum(IMPORT_SOURCE_KINDS),
  /** The dialect id, parser id or provider the batch was read with. */
  sourceRef: z.string().nullable(),
  parserVersion: z.string().nullable(),
  commitKey: z.string().nullable(),
  rowCount: z.number().int().nonnegative(),
  /** Inclusive `YYYY-MM-DD` span of the rows written; both null for an empty batch. */
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  checkpointId: z.string().nullable(),
  createdAt: z.string(),
});

export type ImportBatch = z.infer<typeof ImportBatchSchema>;

/** Newest first; `before` is the previous page's `nextBefore`. */
export const ImportBatchesQuerySchema = z.object({
  limit: LimitQuery,
  before: z.string().optional(),
});

export const ImportBatchPageSchema = z.object({
  data: z.array(ImportBatchSchema),
  /** `createdAt` to pass back as `before` for the next page; null on the last page. */
  nextBefore: z.string().nullable(),
});

/** Inclusive `YYYY-MM-DD` span. */
export const DateSpanSchema = z.object({ from: z.string(), to: z.string() });

/**
 * When an account last got data, and how it usually gets it. Every field is
 * null rather than absent when there is nothing to say, so a consumer can
 * tell "never imported" from "this server predates the field".
 *
 * `span` is the min/max date of the account's transactions — every row,
 * however it arrived — not of the last batch, because the question it
 * answers is what a new statement would duplicate. `cadenceDays` is the
 * median gap between the last five batches, null under three, and is
 * computed here once for the staleness nudge (POPS-2890) to consume.
 */
export const ImportStatusSchema = z.object({
  lastImportAt: z.string().nullable(),
  /** When a provider pass last ran for the account, found anything or not; null for one never synced. */
  lastSyncedAt: z.string().nullable(),
  lastBatchId: z.string().nullable(),
  newestTransactionDate: z.string().nullable(),
  span: DateSpanSchema.nullable(),
  cadenceDays: z.number().int().nonnegative().nullable(),
  /** The configured source, or failing that the one the last batch named. */
  source: ImportSourceSchema.nullable(),
});

export type ImportStatus = z.infer<typeof ImportStatusSchema>;

/** The `account_import_config` row as the wire serves it. */
export const ImportConfigSchema = z.object({
  accountId: z.string(),
  sourceKind: z.enum(IMPORT_SOURCE_KINDS),
  dialectId: z.string().nullable(),
  parserId: z.string().nullable(),
  provider: z.enum(IMPORT_PROVIDERS).nullable(),
  /** The provider's own id for this account, e.g. an Up account id. */
  externalAccountRef: z.string().nullable(),
  expectedCadenceDays: z.number().int().positive().nullable(),
  /** The NAME of the secret holding the provider token, never the token. */
  secretRef: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ImportConfig = z.infer<typeof ImportConfigSchema>;

/**
 * Body for `PUT /accounts/:id/import-config`. A missing optional field is
 * stored as null: the row is replaced whole, not patched, so a config cannot
 * keep a dialect from a previous life as a CSV source.
 */
export const WriteImportConfigBodySchema = z.object({
  sourceKind: z.enum(IMPORT_SOURCE_KINDS),
  dialectId: z.string().min(1).nullable().optional(),
  parserId: z.string().min(1).nullable().optional(),
  provider: z.enum(IMPORT_PROVIDERS).nullable().optional(),
  externalAccountRef: z.string().min(1).nullable().optional(),
  expectedCadenceDays: z.number().int().positive().nullable().optional(),
  secretRef: z.string().min(1).nullable().optional(),
});

export type WriteImportConfigBody = z.infer<typeof WriteImportConfigBodySchema>;
