/**
 * Suggest tags for a transaction with source attribution.
 *
 * Strategy (order = priority for deduplication):
 * 1. Correction rules — tags from matching entity corrections (source: "rule")
 * 2. Tag rules — tags from transaction_tag_rules (source: "rule")
 * 3. AI tags — returned directly by AI or validated category string (source: "ai")
 * 4. Entity defaults — from entity.default_tags (source: "entity")
 *
 * PRD-212 hot-path move: this module is finance-owned (it reads
 * `transaction_tag_rules` and `entities`, both finance-pillar tables) so it
 * lives next to the finance routers and reads through `getFinanceDrizzle()`.
 * Corrections are owned by the finance pillar too (the `transaction_corrections`
 * table lives in finance-db); the in-tree `findAllMatchingCorrections` helper
 * — a thin shim over `@pops/finance-db`'s `transactionCorrectionsService` —
 * stays the call site so the core/corrections namespace keeps its single
 * read-API entry point.
 */
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';

import { entities } from '@pops/db-types';
import { transactionTagRules } from '@pops/finance-db';

import { getFinanceDrizzle } from '../../../db/finance-handle.js';
import { logger } from '../../../lib/logger.js';
import { parseJsonStringArray } from '../../../shared/json.js';
import { findAllMatchingCorrections } from '../../core/corrections/service.js';
import { normalizeDescription } from '../../core/corrections/types-base.js';

import type { SuggestedTag } from '../imports/types.js';

export interface SuggestTagsOptions {
  description: string;
  entityId: string | null;
  aiTags?: string[];
  aiCategory?: string | null;
  knownTags?: string[];
  correctionTags?: string[];
  correctionPattern?: string;
}

interface RuleTagsArgs {
  description: string;
  correctionTags: string[] | undefined;
  correctionPattern: string | undefined;
  seen: Set<string>;
  result: SuggestedTag[];
}

function addCorrectionTags(args: RuleTagsArgs): void {
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

type TagRuleRow = { tags: string; descriptionPattern: string };

function buildEntityFilter(entityId: string | null): ReturnType<typeof or> {
  return entityId !== null
    ? or(isNull(transactionTagRules.entityId), eq(transactionTagRules.entityId, entityId))
    : isNull(transactionTagRules.entityId);
}

function findMatchingTagRules(description: string, entityId: string | null): TagRuleRow[] {
  const db = getFinanceDrizzle();
  const norm = normalizeDescription(description);
  const ef = buildEntityFilter(entityId);
  const cols = {
    tags: transactionTagRules.tags,
    descriptionPattern: transactionTagRules.descriptionPattern,
  };
  const base = and(eq(transactionTagRules.isActive, true), ef);

  const exact = db
    .select(cols)
    .from(transactionTagRules)
    .where(
      and(
        base,
        eq(transactionTagRules.matchType, 'exact'),
        eq(transactionTagRules.descriptionPattern, norm)
      )
    )
    .orderBy(desc(transactionTagRules.confidence))
    .all();

  const contains = db
    .select(cols)
    .from(transactionTagRules)
    .where(
      and(
        base,
        eq(transactionTagRules.matchType, 'contains'),
        sql`${norm} LIKE '%' || upper(${transactionTagRules.descriptionPattern}) || '%'`
      )
    )
    .orderBy(desc(transactionTagRules.confidence))
    .all();

  const regexCandidates = db
    .select(cols)
    .from(transactionTagRules)
    .where(and(base, eq(transactionTagRules.matchType, 'regex')))
    .orderBy(desc(transactionTagRules.confidence))
    .all();

  const regex = regexCandidates.filter((r) => {
    try {
      return new RegExp(r.descriptionPattern, 'i').test(description);
    } catch (err) {
      logger.warn(
        { pattern: r.descriptionPattern, err },
        '[tag-rules] invalid regex pattern — skipping rule'
      );
      return false;
    }
  });

  return [...exact, ...contains, ...regex];
}

function addTagRuleTags(
  description: string,
  entityId: string | null,
  seen: Set<string>,
  result: SuggestedTag[]
): void {
  for (const rule of findMatchingTagRules(description, entityId)) {
    for (const tag of parseJsonStringArray(rule.tags)) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      result.push({ tag, source: 'rule', pattern: rule.descriptionPattern });
    }
  }
}

interface AddAiTagsArgs {
  aiTags: string[] | undefined;
  aiCategory: string | null | undefined;
  knownTags: string[] | undefined;
  seen: Set<string>;
  result: SuggestedTag[];
}

function addAiTags(args: AddAiTagsArgs): void {
  const { aiTags, aiCategory, knownTags, seen, result } = args;
  const knownSet = new Set(knownTags?.map((t) => t.toLowerCase()) ?? []);
  let tags: string[];
  if (aiTags && aiTags.length > 0) {
    tags = aiTags;
  } else if (aiCategory && knownTags) {
    const matched = knownTags.find((t) => t.toLowerCase() === aiCategory.toLowerCase());
    tags = matched ? [matched] : [];
  } else {
    return;
  }
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    const isNew = !knownSet.has(tag.toLowerCase()) || undefined;
    result.push({ tag, source: 'ai', ...(isNew ? { isNew: true } : {}) });
  }
}

function addEntityTags(entityId: string | null, seen: Set<string>, result: SuggestedTag[]): void {
  if (!entityId) return;
  const entity = getFinanceDrizzle()
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
  addCorrectionTags({
    description: opts.description,
    correctionTags: opts.correctionTags,
    correctionPattern: opts.correctionPattern,
    seen,
    result,
  });
  addTagRuleTags(opts.description, opts.entityId, seen, result);
  addAiTags({
    aiTags: opts.aiTags,
    aiCategory: opts.aiCategory,
    knownTags: opts.knownTags,
    seen,
    result,
  });
  addEntityTags(opts.entityId, seen, result);
  return result;
}
