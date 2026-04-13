/**
 * Suggest tags for a transaction with source attribution.
 *
 * Strategy (order = priority for deduplication):
 * 1. Correction rules — tags from matching corrections (source: "rule")
 * 2. AI category — validated against knownTags (source: "ai")
 * 3. Entity defaults — from entity.default_tags (source: "entity")
 *
 * Returns SuggestedTag[] with source attribution and optional pattern.
 */
import { entities } from '@pops/db-types';
import { eq } from 'drizzle-orm';

import { getDrizzle } from '../db.js';
import { findAllMatchingCorrections } from '../modules/core/corrections/service.js';
import type { SuggestedTag } from '../modules/finance/imports/types.js';
import { parseJsonStringArray } from './json.js';

export interface SuggestTagsOptions {
  description: string;
  entityId: string | null;
  /** AI-suggested category string (validated against knownTags). */
  aiCategory?: string | null;
  /** All tag strings currently in the transactions table (for AI validation). */
  knownTags?: string[];
  /** Pre-parsed correction tags (skips DB lookup when caller already has them). */
  correctionTags?: string[];
  /** The description_pattern from the matched correction (for attribution). */
  correctionPattern?: string;
}

export function suggestTags(opts: SuggestTagsOptions): SuggestedTag[] {
  const { description, entityId, aiCategory, knownTags, correctionTags, correctionPattern } = opts;
  const db = getDrizzle();
  const seen = new Set<string>();
  const result: SuggestedTag[] = [];

  // 1. Correction rule tags (pre-parsed or from DB)
  if (correctionTags && correctionTags.length > 0) {
    for (const tag of correctionTags) {
      if (!seen.has(tag)) {
        seen.add(tag);
        result.push({ tag, source: 'rule', pattern: correctionPattern });
      }
    }
  } else {
    const corrections = findAllMatchingCorrections(description);
    for (const correction of corrections) {
      const tags = parseJsonStringArray(correction.tags);
      for (const tag of tags) {
        if (!seen.has(tag)) {
          seen.add(tag);
          result.push({ tag, source: 'rule', pattern: correction.descriptionPattern ?? undefined });
        }
      }
    }
  }

  // 2. AI category — only if it case-insensitively matches a known tag
  if (aiCategory && knownTags) {
    const lowerCategory = aiCategory.toLowerCase();
    const matched = knownTags.find((t) => t.toLowerCase() === lowerCategory) ?? null;
    if (matched && !seen.has(matched)) {
      seen.add(matched);
      result.push({ tag: matched, source: 'ai' });
    }
  }

  // 3. Entity default tags
  if (entityId) {
    const entity = db
      .select({ defaultTags: entities.defaultTags })
      .from(entities)
      .where(eq(entities.id, entityId))
      .get();

    if (entity?.defaultTags) {
      const tags = parseJsonStringArray(entity.defaultTags);
      for (const tag of tags) {
        if (!seen.has(tag)) {
          seen.add(tag);
          result.push({ tag, source: 'entity' });
        }
      }
    }
  }

  return result;
}
