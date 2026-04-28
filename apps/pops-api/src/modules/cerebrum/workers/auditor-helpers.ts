/**
 * Auditor worker helpers — quality scoring, contradiction pair building, and
 * coverage gap detection. Extracted from auditor.ts to respect max-lines.
 */
import { topLevelScope } from './worker-base.js';

import type { EngramService } from '../engrams/service.js';
import type { Engram } from '../engrams/types.js';
import type { QualityFactors, QualityResult } from './types.js';

const QUALITY_WEIGHTS = {
  completeness: 0.3,
  specificity: 0.3,
  templateFit: 0.2,
  linkDensity: 0.2,
} as const;

const MIN_WORD_COUNT = 50;
const MAX_LINK_DENSITY = 10;

const SPECIFICITY_PATTERNS = [
  /\b\d{4}[-/]\d{2}[-/]\d{2}\b/,
  /\b\d+(\.\d+)?%/,
  /\$\d+/,
  /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/,
  /\b\d+\s*(hours?|minutes?|days?|weeks?|months?|years?)\b/i,
  /https?:\/\/\S+/,
];

export { MIN_WORD_COUNT };

/** Compute the quality score for a single engram. */
export function computeQualityScore(engram: Engram, engramService: EngramService): QualityResult {
  const factors = computeFactors(engram, engramService);
  const score = Math.min(
    1.0,
    Math.max(
      0.0,
      QUALITY_WEIGHTS.completeness * factors.completeness +
        QUALITY_WEIGHTS.specificity * factors.specificity +
        QUALITY_WEIGHTS.templateFit * factors.templateFit +
        QUALITY_WEIGHTS.linkDensity * factors.linkDensity
    )
  );
  return { score, factors };
}

function computeFactors(engram: Engram, engramService: EngramService): QualityFactors {
  return {
    completeness: scoreCompleteness(engram),
    specificity: scoreSpecificity(engram, engramService),
    templateFit: scoreTemplateFit(engram, engramService),
    linkDensity: Math.min(engram.links.length / MAX_LINK_DENSITY, 1.0),
  };
}

function scoreCompleteness(engram: Engram): number {
  let score = 0;
  if (engram.title && engram.title.trim().length > 0) score++;
  if (engram.wordCount > MIN_WORD_COUNT) score++;
  if (engram.scopes.length > 0) score++;
  if (engram.tags.length > 0) score++;
  return score / 4;
}

function readBody(engramId: string, engramService: EngramService): string | null {
  try {
    return engramService.read(engramId).body;
  } catch {
    return null;
  }
}

function scoreSpecificity(engram: Engram, engramService: EngramService): number {
  const body = readBody(engram.id, engramService);
  if (body === null) return 0;
  let matches = 0;
  for (const pattern of SPECIFICITY_PATTERNS) {
    if (pattern.test(body)) matches++;
  }
  const specificTags = engram.tags.filter((t) => t.includes(':'));
  const tagBonus = Math.min(specificTags.length / 3, 1.0);
  return (Math.min(matches / SPECIFICITY_PATTERNS.length, 1.0) + tagBonus) / 2;
}

function scoreTemplateFit(engram: Engram, engramService: EngramService): number {
  if (!engram.template) return 0.5;
  const body = readBody(engram.id, engramService);
  if (body === null) return 0.5;
  const headerPattern = /^#{1,3}\s+(.+)$/gm;
  let headerCount = 0;
  while (headerPattern.exec(body) !== null) headerCount++;
  return Math.min(headerCount / 5, 1.0);
}

/** Generate improvement suggestions for a low-quality engram. */
export function generateSuggestions(engram: Engram, result: QualityResult): string[] {
  const suggestions: string[] = [];
  if (result.factors.completeness <= 0.5) {
    if (engram.wordCount <= MIN_WORD_COUNT)
      suggestions.push(`Expand body (${engram.wordCount}/${MIN_WORD_COUNT} words)`);
    if (engram.tags.length === 0) suggestions.push('Add at least one tag');
    if (!engram.title || engram.title.trim().length === 0)
      suggestions.push('Add a descriptive title');
  }
  if (result.factors.specificity < 0.3)
    suggestions.push('Add specific details: dates, names, numbers, or references');
  if (result.factors.linkDensity < 0.2) suggestions.push('Add cross-references to related engrams');
  if (result.factors.templateFit < 0.3 && engram.template)
    suggestions.push('Fill in template-suggested sections');
  return suggestions;
}

function groupByTopScope(engrams: Engram[]): Map<string, Engram[]> {
  const groups = new Map<string, Engram[]>();
  for (const engram of engrams) {
    for (const scope of engram.scopes) {
      const top = topLevelScope(scope);
      const group = groups.get(top) ?? [];
      if (!group.some((e) => e.id === engram.id)) {
        group.push(engram);
        groups.set(top, group);
      }
    }
  }
  return groups;
}

function sharesTags(a: Engram, b: Engram): boolean {
  const aTagSet = new Set(a.tags);
  return b.tags.some((t) => aTagSet.has(t));
}

function collectGroupPairs(
  group: Engram[],
  seen: Set<string>,
  pairs: Array<[Engram, Engram]>
): void {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];
      if (!a || !b) continue;
      const key = [a.id, b.id].toSorted().join('::');
      if (seen.has(key)) continue;
      seen.add(key);
      if (sharesTags(a, b)) pairs.push([a, b]);
    }
  }
}

/** Build unique pairs of engrams that share tags within the same scope group. */
export function buildTagSharedPairs(engrams: Engram[]): Array<[Engram, Engram]> {
  const scopeGroups = groupByTopScope(engrams);
  const seen = new Set<string>();
  const pairs: Array<[Engram, Engram]> = [];
  for (const group of scopeGroups.values()) {
    collectGroupPairs(group, seen, pairs);
  }
  return pairs;
}
