/**
 * Pure helper functions for the ingestion pipeline.
 * Extracted from pipeline.ts to stay under the max-lines lint rule.
 */
import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { engramIndex } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

export function hashContent(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

export function findDuplicate(bodyHash: string): string | null {
  try {
    const db = getDrizzle();
    const row = db
      .select({ id: engramIndex.id })
      .from(engramIndex)
      .where(and(eq(engramIndex.bodyHash, bodyHash), eq(engramIndex.status, 'active')))
      .get();
    return row?.id ?? null;
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
 * Merge extracted referenced_dates into the custom fields map.
 * Only adds the field when there are date entities to store.
 */
export function mergeReferencedDates(
  existing: Record<string, unknown> | undefined,
  referencedDates: string[]
): Record<string, unknown> | undefined {
  if (referencedDates.length === 0) return existing;
  return { ...existing, referenced_dates: referencedDates };
}
