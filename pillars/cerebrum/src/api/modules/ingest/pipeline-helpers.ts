/**
 * Pure helper functions for the ingestion pipeline.
 *
 * Lifted from `apps/pops-api/src/modules/cerebrum/ingest/pipeline-helpers.ts`.
 * `findDuplicate` takes the pillar `CerebrumDb` handle (rather than reaching a
 * monolith singleton) and resolves through the engrams data-access layer.
 */
import { createHash } from 'node:crypto';

import { engramsService, type CerebrumDb } from '../../../db/index.js';

export function hashContent(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/** Resolve the id of an active engram with identical body content, if any. */
export function findDuplicate(db: CerebrumDb, bodyHash: string): string | null {
  try {
    return engramsService.findActiveIdByBodyHash(db, bodyHash);
  } catch {
    return null;
  }
}

export function deriveTitle(body: string): string {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed.replace(/^#+\s*/, '').slice(0, 120);
    }
  }
  return 'Untitled';
}

export function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Merge extracted `referenced_dates` into the custom-fields map. Only adds the
 * field when there are date entities to store.
 */
export function mergeReferencedDates(
  existing: Record<string, unknown> | undefined,
  referencedDates: string[]
): Record<string, unknown> | undefined {
  if (referencedDates.length === 0) return existing;
  return { ...existing, referenced_dates: referencedDates };
}
