/**
 * Suggest tags for a transaction with source attribution.
 *
 * Strategy (order = priority for dedup):
 *   1. Correction rules — tags from matching `transaction_corrections` (source: "rule")
 *   2. Tag rules — tags from `transaction_tag_rules` (source: "rule")
 *   3. AI tags — returned directly by AI or a validated category string (source: "ai")
 *   4. Entity defaults — the contact's `defaultTags`, supplied by the caller
 *      from the live contacts fetch (source: "entity")
 *
 * Ported from `apps/pops-api/src/modules/finance/tag-suggester/index.ts`.
 * Finance-owned: the rule/correction sources read finance-db tables via the
 * injected `FinanceDb` handle. The entity-default tags no longer read a local
 * mirror — they come from `entityDefaultTags`, a `contactId → tags` map the
 * caller builds from the contacts pillar (PRD-163 US-03).
 */
import { type FinanceDb, transactionCorrectionsService } from '../../../db/index.js';
import { findMatchingTagRules } from './tag-rule-matching.js';

export type TagSuggestionSource = 'rule' | 'ai' | 'entity';

export interface SuggestedTag {
  tag: string;
  source: TagSuggestionSource;
  pattern?: string;
  isNew?: boolean;
}

export interface SuggestTagsOptions {
  description: string;
  entityId: string | null;
  aiTags?: string[];
  aiCategory?: string | null;
  knownTags?: string[];
  correctionTags?: string[];
  correctionPattern?: string;
  /**
   * `contactId → defaultTags`, sourced from the live contacts fetch by the
   * caller. Absent/empty ⇒ the entity-default tag stage contributes nothing.
   */
  entityDefaultTags?: ReadonlyMap<string, string[]>;
}

function parseTags(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

interface TagPass {
  db: FinanceDb;
  description: string;
  entityId: string | null;
  entityDefaultTags: ReadonlyMap<string, string[]>;
  seen: Set<string>;
  result: SuggestedTag[];
}

function addCorrectionTags(
  pass: TagPass,
  correctionTags: string[] | undefined,
  correctionPattern: string | undefined
): void {
  const { db, description, seen, result } = pass;
  if (correctionTags && correctionTags.length > 0) {
    for (const tag of correctionTags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      result.push({ tag, source: 'rule', pattern: correctionPattern });
    }
    return;
  }
  for (const correction of transactionCorrectionsService.findAllMatchingTransactionCorrections(
    db,
    description
  )) {
    for (const tag of parseTags(correction.tags)) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      result.push({ tag, source: 'rule', pattern: correction.descriptionPattern ?? undefined });
    }
  }
}

function addTagRuleTags(pass: TagPass): void {
  const { db, description, entityId, seen, result } = pass;
  for (const rule of findMatchingTagRules(db, description, entityId)) {
    for (const tag of parseTags(rule.tags)) {
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

function addEntityTags(pass: TagPass): void {
  const { entityId, entityDefaultTags, seen, result } = pass;
  if (!entityId) return;
  const tags = entityDefaultTags.get(entityId);
  if (!tags) return;
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    result.push({ tag, source: 'entity' });
  }
}

export function suggestTags(db: FinanceDb, opts: SuggestTagsOptions): SuggestedTag[] {
  const pass: TagPass = {
    db,
    description: opts.description,
    entityId: opts.entityId,
    entityDefaultTags: opts.entityDefaultTags ?? new Map(),
    seen: new Set<string>(),
    result: [],
  };
  addCorrectionTags(pass, opts.correctionTags, opts.correctionPattern);
  addTagRuleTags(pass);
  addAiTags({
    aiTags: opts.aiTags,
    aiCategory: opts.aiCategory,
    knownTags: opts.knownTags,
    seen: pass.seen,
    result: pass.result,
  });
  addEntityTags(pass);
  return pass.result;
}
