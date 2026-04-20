import { eq } from 'drizzle-orm';

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

import { getDrizzle } from '../db.js';
import { findAllMatchingCorrections } from '../modules/core/corrections/service.js';
import { parseJsonStringArray } from './json.js';

import type { SuggestedTag } from '../modules/finance/imports/types.js';

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

interface RuleTagsArgs {
  description: string;
  correctionTags: string[] | undefined;
  correctionPattern: string | undefined;
  seen: Set<string>;
  result: SuggestedTag[];
}

function addRuleTags(args: RuleTagsArgs): void {
  const { description, correctionTags, correctionPattern, seen, result } = args;
  if (correctionTags && correctionTags.length > 0) {
    for (const tag of correctionTags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      result.push({ tag, source: 'rule', pattern: correctionPattern });
    }
    return;
  }
  for (const correction of findAllMatchingCorrections(description)) {
    for (const tag of parseJsonStringArray(correction.tags)) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      result.push({ tag, source: 'rule', pattern: correction.descriptionPattern ?? undefined });
    }
  }
}

function addAiTag(
  aiCategory: string | null | undefined,
  knownTags: string[] | undefined,
  seen: Set<string>,
  result: SuggestedTag[]
): void {
  if (!aiCategory || !knownTags) return;
  const lowerCategory = aiCategory.toLowerCase();
  const matched = knownTags.find((t) => t.toLowerCase() === lowerCategory) ?? null;
  if (matched && !seen.has(matched)) {
    seen.add(matched);
    result.push({ tag: matched, source: 'ai' });
  }
}

function addEntityTags(entityId: string | null, seen: Set<string>, result: SuggestedTag[]): void {
  if (!entityId) return;
  const entity = getDrizzle()
    .select({ defaultTags: entities.defaultTags })
    .from(entities)
    .where(eq(entities.id, entityId))
    .get();
  if (!entity?.defaultTags) return;

  for (const tag of parseJsonStringArray(entity.defaultTags)) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    result.push({ tag, source: 'entity' });
  }
}

export function suggestTags(opts: SuggestTagsOptions): SuggestedTag[] {
  const seen = new Set<string>();
  const result: SuggestedTag[] = [];

  addRuleTags({
    description: opts.description,
    correctionTags: opts.correctionTags,
    correctionPattern: opts.correctionPattern,
    seen,
    result,
  });
  addAiTag(opts.aiCategory, opts.knownTags, seen, result);
  addEntityTags(opts.entityId, seen, result);

  return result;
}
