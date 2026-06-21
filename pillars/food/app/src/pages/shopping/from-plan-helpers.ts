/**
 * Pure helpers for the FromPlanPage — kept out of the component so the
 * function stays under the per-function lint cap and the test surface
 * isn't dragged through React.
 */
import { defaultRange } from './range-helpers.js';

import type { GeneratorPreview } from './types.js';

export function initialRangeFromParams(
  startParam: string | null,
  endParam: string | null
): { start: string; end: string } {
  const fallback = defaultRange();
  const start =
    startParam !== null && /^\d{4}-\d{2}-\d{2}$/.test(startParam) ? startParam : fallback.start;
  const end = endParam !== null && /^\d{4}-\d{2}-\d{2}$/.test(endParam) ? endParam : fallback.end;
  return { start, end };
}

export function previewHasWritableItems(preview: GeneratorPreview | undefined): boolean {
  if (preview === undefined) return false;
  for (const section of preview.sections) {
    for (const item of section.items) {
      if (item.isUnconverted || item.buyQty > 0) return true;
    }
  }
  return false;
}

export const GENERATE_ERROR_I18N_KEYS = {
  BadDateRange: 'shopping.fromPlan.error.BadDateRange',
  NoPlanEntries: 'shopping.fromPlan.error.NoPlanEntries',
  ListNameEmpty: 'shopping.fromPlan.error.ListNameEmpty',
  BulkAddFailed: 'shopping.fromPlan.error.BulkAddFailed',
} as const;
