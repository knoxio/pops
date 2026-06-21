import { z } from 'zod';

/**
 * Canonical wire shape for a single AI inference event — the SINGLE SOURCE OF
 * TRUTH for the `POST /ai-usage/record` ingest. The ai pillar's ingest route
 * imports this exact schema so the wrapper and the sink can never drift.
 *
 * One row per Claude call. PII discipline: `contextId` is an opaque,
 * low-cardinality key (no whitespace), `metadata` is caller-supplied and must
 * be PII-free; the server caps its serialized length defensively.
 */
export const InferenceRecordSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  /** Free-form; each pillar owns its operation vocabulary. */
  operation: z.string().min(1),
  /** The caller's pillar id (validated against KNOWN_MODULES server-side). */
  domain: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().finite(),
  latencyMs: z.number().int().nonnegative(),
  status: z.enum(['success', 'error', 'timeout', 'budget-blocked']),
  /** Stored as 0|1 server-side. */
  cached: z.boolean(),
  /** Opaque low-cardinality FK to the originating row; no whitespace (PII guard). */
  contextId: z.string().max(128).regex(/^\S+$/).optional(),
  /** Merged into `metadata.prompt_version` server-side. */
  promptVersion: z.string().max(64).optional(),
  errorMessage: z.string().max(1000).optional(),
  /** Caller-supplied, PII-free; server caps the serialized JSON length. */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type InferenceRecord = z.infer<typeof InferenceRecordSchema>;
