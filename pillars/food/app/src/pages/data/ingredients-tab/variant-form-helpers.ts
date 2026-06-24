/**
 * Form value helpers for `VariantFormDialog`. Kept as a sibling so the
 * dialog component stays under the per-function lint cap.
 */
import type { IngredientVariantRow } from './ingredient-wire-types.js';

export type Unit = 'g' | 'ml' | 'count';
export const UNITS: readonly Unit[] = ['g', 'ml', 'count'];

export interface VariantFormValues {
  slug: string;
  name: string;
  defaultUnit: Unit;
  packageSizeG: number | null;
  defaultShelfLifeDaysFridge: number | null;
  defaultShelfLifeDaysFreezer: number | null;
  notes: string | null;
}

export interface VariantFormState {
  slug: string;
  name: string;
  defaultUnit: Unit;
  packageSizeG: string;
  shelfLifeFridge: string;
  shelfLifeFreezer: string;
  notes: string;
}

export const BLANK_VARIANT_FORM: VariantFormState = {
  slug: '',
  name: '',
  defaultUnit: 'count',
  packageSizeG: '',
  shelfLifeFridge: '',
  shelfLifeFreezer: '',
  notes: '',
};

export function variantFormFromRow(row: IngredientVariantRow | null): VariantFormState {
  if (row === null) return BLANK_VARIANT_FORM;
  return {
    slug: row.slug,
    name: row.name,
    defaultUnit: row.defaultUnit,
    packageSizeG: row.packageSizeG === null ? '' : String(row.packageSizeG),
    shelfLifeFridge:
      row.defaultShelfLifeDaysFridge === null ? '' : String(row.defaultShelfLifeDaysFridge),
    shelfLifeFreezer:
      row.defaultShelfLifeDaysFreezer === null ? '' : String(row.defaultShelfLifeDaysFreezer),
    notes: row.notes ?? '',
  };
}

function parsePositiveNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseNonNegativeInt(raw: string): number | null {
  const n = parsePositiveNumber(raw);
  if (n === null) return null;
  // Shelf-life columns are integers on the DB side and the server validates
  // with `z.number().int().nonnegative()` — coerce to int so decimal typos
  // don't reach the backend as `BAD_REQUEST`.
  return Math.floor(n);
}

export function variantFormToValues(form: VariantFormState): VariantFormValues {
  return {
    slug: form.slug.trim(),
    name: form.name.trim(),
    defaultUnit: form.defaultUnit,
    packageSizeG: parsePositiveNumber(form.packageSizeG),
    defaultShelfLifeDaysFridge: parseNonNegativeInt(form.shelfLifeFridge),
    defaultShelfLifeDaysFreezer: parseNonNegativeInt(form.shelfLifeFreezer),
    notes: form.notes.trim().length === 0 ? null : form.notes.trim(),
  };
}
