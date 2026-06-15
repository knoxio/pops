/**
 * Lift PRD-125's partialReason out of `ingest_sources.extracted_json`.
 * The pops-api side has its own copy at
 * `apps/pops-api/src/modules/food/services/ingest-state.ts`; this helper
 * mirrors the contract so the DB layer doesn't import from the API.
 */
import type { PartialReason } from '../contract/queue/index.js';

const VALID: ReadonlySet<PartialReason> = new Set<PartialReason>([
  'auth-dead',
  'rate-limited',
  'stt-failed',
  'vision-failed',
  'caption-only-fallback',
  'empty-extraction',
]);

export function extractPartialReasonFromExtractedJson(
  extractedJson: string | null
): PartialReason | undefined {
  if (extractedJson === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractedJson);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || !('partialReason' in parsed)) {
    return undefined;
  }
  const reason: unknown = (parsed as { partialReason: unknown }).partialReason;
  if (typeof reason !== 'string') return undefined;
  return (VALID as ReadonlySet<string>).has(reason) ? (reason as PartialReason) : undefined;
}
