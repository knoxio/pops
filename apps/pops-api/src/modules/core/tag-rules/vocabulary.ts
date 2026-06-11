/**
 * Thin shim that forwards the in-tree `tag_vocabulary` read/write API to
 * `@pops/finance-db`'s `tagVocabularyService`.
 *
 * Track N5 phase 1 PR 3 routing flip — the public signatures
 * (`listVocabulary` / `upsertVocabularyTag(tag, source)`) are preserved so
 * the in-tree callers — `tagRulesRouter.listVocabulary`,
 * `tagRulesRouter.applyTagRuleChangeSet`, and the imports pipeline's
 * `applyTagRuleChangeSetsPhase` (under `modules/finance/imports/`) — keep
 * compiling untouched.
 *
 * **Scoping note (Option A: cross-pillar workspace import).** This file
 * lives under `modules/core/` because tag rules + the vocabulary they
 * govern were originally classified as a `core` concern. The data and
 * the package owner are firmly in the finance pillar, so the cutover
 * imports `@pops/finance-db` directly rather than waiting for PRD-level
 * reclassification of the slice (Option B). This mirrors the way Track N3
 * (#2899) handled the same `core/`-housed-but-finance-owned situation
 * for `transaction_corrections`. PR 4 of the sequence deletes this shim
 * once nothing in pops-api references it.
 *
 * **Handle: `getFinanceDrizzle()`.** Per the canonical PR 3 pattern
 * (#2781, #2894) reads + writes now go through the finance pillar's
 * lazily-opened `finance.db`. In named-env / test context
 * `getFinanceDrizzle()` short-circuits to the env DB so existing fixtures
 * keep seeing the same rows; in production the next deploy's boot-time
 * backfill carries the existing rows across (see
 * `db/backfill-finance-from-shared.ts`).
 *
 * No `mapDomainErrors` plumbing: the package exports no typed errors
 * for this slice — `listVocabularyTags` returns `[]` when empty and
 * `upsertVocabularyTag` is idempotent.
 */
import { tagVocabularyService } from '@pops/finance-db';

import { getFinanceDrizzle } from '../../../db/finance-handle.js';

export function listVocabulary(): string[] {
  return tagVocabularyService.listVocabularyTags(getFinanceDrizzle());
}

export function upsertVocabularyTag(tag: string, source: 'seed' | 'user'): void {
  tagVocabularyService.upsertVocabularyTag(getFinanceDrizzle(), tag, source);
}
