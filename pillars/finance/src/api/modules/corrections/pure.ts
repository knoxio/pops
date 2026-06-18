/**
 * Pure, in-memory correction-rule matchers + ChangeSet application.
 *
 * The rule matchers (`ruleMatchesDescription`, `findAll*`) are copied (per the
 * severance rules) from the monolith. ChangeSet application is delegated to the
 * contract's shared {@link applyChangeSetToRulesPure} so the pillar and the
 * `app-finance` optimistic merge run one implementation; this wrapper injects
 * the pillar's `NotFoundError` so a missing edit/disable/remove target maps to
 * a 404 on the REST surface.
 *
 * `normalizeDescription` comes from the pillar's own
 * `transactionCorrectionsService` so the normalisation is identical to the
 * DB-side matcher.
 */
import { applyChangeSetToRules as applyChangeSetToRulesPure } from '../../../contract/corrections-pure.js';
import { transactionCorrectionsService } from '../../../db/index.js';
import { NotFoundError } from '../../shared/errors.js';
import { classifyCorrectionMatch } from './types.js';

import type { ChangeSet } from '../../../contract/rest-corrections.js';
import type { CorrectionMatchResult, CorrectionRow } from './types.js';

const { normalizeDescription } = transactionCorrectionsService;

/** Test whether a single rule's pattern matches a normalized description. */
export function ruleMatchesDescription(rule: CorrectionRow, normalized: string): boolean {
  const pattern = rule.descriptionPattern;
  switch (rule.matchType) {
    case 'exact':
      return pattern.toUpperCase() === normalized;
    case 'contains':
      return pattern.length > 0 && normalized.includes(pattern.toUpperCase());
    case 'regex':
      if (pattern.length === 0) return false;
      try {
        return new RegExp(pattern, 'i').test(normalized);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Return ALL matching correction rules in priority order (priority ASC, id ASC).
 * The first entry is the winner; subsequent entries are overridden alternatives.
 * Inactive rules and rules below `minConfidence` are filtered out first.
 */
export function findAllMatchingCorrectionFromRules(
  description: string,
  rules: CorrectionRow[],
  minConfidence: number = 0.7
): CorrectionRow[] {
  const normalized = normalizeDescription(description);
  const eligible = rules
    .filter((r) => r.isActive && r.confidence >= minConfidence)
    .toSorted((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

  return eligible.filter((rule) => ruleMatchesDescription(rule, normalized));
}

/** First matching rule in priority order, classified — or null when none match. */
export function findMatchingCorrectionFromRules(
  description: string,
  rules: CorrectionRow[],
  minConfidence: number = 0.7
): CorrectionMatchResult | null {
  const first = findAllMatchingCorrectionFromRules(description, rules, minConfidence)[0];
  return first ? classifyCorrectionMatch(first) : null;
}

/**
 * Apply a ChangeSet to an in-memory rule array (no DB). Delegates to the
 * contract's shared, dependency-free implementation, injecting the pillar's
 * `NotFoundError` so a missing edit/disable/remove target surfaces as a 404.
 */
export function applyChangeSetToRules(
  rules: CorrectionRow[],
  changeSet: ChangeSet
): CorrectionRow[] {
  return applyChangeSetToRulesPure(rules, changeSet, (id) => {
    throw new NotFoundError('Correction', id);
  });
}
