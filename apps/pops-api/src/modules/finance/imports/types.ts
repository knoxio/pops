import { z } from "zod";

/**
 * Transaction as parsed from CSV (client-side or transformer)
 * Includes rawRow (full CSV row as JSON) and checksum (SHA-256 hash)
 */
export const parsedTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  description: z.string().min(1),
  amount: z.number(),
  account: z.string().min(1),
  location: z.string().optional(),
  online: z.boolean().optional(),
  rawRow: z.string(), // Full CSV row as JSON string (for audit trail)
  checksum: z.string(), // SHA-256 hash of rawRow (for deduplication)
});

export type ParsedTransaction = z.infer<typeof parsedTransactionSchema>;

/**
 * Entity match result
 */
export const entityMatchSchema = z.object({
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  matchType: z.enum(["alias", "exact", "prefix", "contains", "ai", "learned", "none"]),
  confidence: z.number().min(0).max(1).optional(),
});

export type EntityMatch = z.infer<typeof entityMatchSchema>;

/**
 * Transaction after entity matching
 */
export const transactionTypeSchema = z.enum(["purchase", "transfer", "income"]);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const suggestedTagSchema = z.object({
  tag: z.string(),
  source: z.enum(["ai", "rule", "entity"]),
  /** For rule-sourced tags: the description_pattern from the matched correction */
  pattern: z.string().optional(),
});

export type SuggestedTag = z.infer<typeof suggestedTagSchema>;

export const processedTransactionSchema = parsedTransactionSchema.extend({
  entity: entityMatchSchema,
  status: z.enum(["matched", "uncertain", "failed", "skipped"]),
  skipReason: z.string().optional(), // For skipped transactions (e.g., "Duplicate")
  error: z.string().optional(), // For failed transactions
  transactionType: transactionTypeSchema.optional(), // User-set type; undefined = purchase (default)
  suggestedTags: z.array(suggestedTagSchema).optional(),
});

export type ProcessedTransaction = z.infer<typeof processedTransactionSchema>;

/**
 * Transaction confirmed by user (after review)
 * entityId/entityName are omitted for transfers and income.
 */
export const confirmedTransactionSchema = parsedTransactionSchema.extend({
  transactionType: transactionTypeSchema.optional(),
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  tags: z.array(z.string()).optional(),
  /** Source attribution metadata — used by TagReviewStep for badges. */
  suggestedTags: z.array(suggestedTagSchema).optional(),
});

export type ConfirmedTransaction = z.infer<typeof confirmedTransactionSchema>;

/**
 * Input for processImport endpoint
 */
export const processImportInputSchema = z.object({
  transactions: z.array(parsedTransactionSchema),
  account: z.string().min(1),
});

export type ProcessImportInput = z.infer<typeof processImportInputSchema>;

/**
 * Import warning - non-fatal issues during processing
 */
export const importWarningSchema = z.object({
  type: z.enum(["AI_CATEGORIZATION_UNAVAILABLE", "AI_API_ERROR"]),
  message: z.string(),
  affectedCount: z.number().optional(),
  details: z.string().optional(),
});

export type ImportWarning = z.infer<typeof importWarningSchema>;

/**
 * AI usage statistics for import batch
 */
export const aiUsageStatsSchema = z.object({
  apiCalls: z.number(),
  cacheHits: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCostUsd: z.number(),
  avgCostPerCall: z.number(),
});

export type AiUsageStats = z.infer<typeof aiUsageStatsSchema>;

/**
 * Output for processImport endpoint
 */
export const processImportOutputSchema = z.object({
  matched: z.array(processedTransactionSchema),
  uncertain: z.array(processedTransactionSchema),
  failed: z.array(processedTransactionSchema),
  skipped: z.array(processedTransactionSchema),
  warnings: z.array(importWarningSchema).optional(),
  aiUsage: aiUsageStatsSchema.optional(),
});

export type ProcessImportOutput = z.infer<typeof processImportOutputSchema>;

/**
 * Input for executeImport endpoint
 */
export const executeImportInputSchema = z.object({
  transactions: z.array(confirmedTransactionSchema),
});

export type ExecuteImportInput = z.infer<typeof executeImportInputSchema>;

/**
 * Import result for a single transaction
 */
export const importResultSchema = z.object({
  transaction: confirmedTransactionSchema,
  success: z.boolean(),
  error: z.string().optional(),
  /** ID of the created transaction row. */
  pageId: z.string().optional(),
});

export type ImportResult = z.infer<typeof importResultSchema>;

/**
 * Output for executeImport endpoint
 */
export const executeImportOutputSchema = z.object({
  imported: z.number(),
  failed: z.array(importResultSchema),
  skipped: z.number(),
});

export type ExecuteImportOutput = z.infer<typeof executeImportOutputSchema>;

/**
 * Input for createEntity endpoint
 */
export const createEntityInputSchema = z.object({
  name: z.string().min(1).max(200),
});

export type CreateEntityInput = z.infer<typeof createEntityInputSchema>;

/**
 * Output for createEntity endpoint
 */
export const createEntityOutputSchema = z.object({
  entityId: z.string(),
  entityName: z.string(),
});

export type CreateEntityOutput = z.infer<typeof createEntityOutputSchema>;
