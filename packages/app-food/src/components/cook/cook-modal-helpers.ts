/**
 * State helpers for `CookModal` — PRD-144.
 *
 * `initialForm` + `seedForm` keep the modal pure: the open effect calls
 * `seedForm` once with the resolved `CookPreparation`, then the user
 * mutates fields freely. `buildSubmitInput` snaps the form into the
 * `food.cook.markCooked` wire shape.
 */
import type { CookPreparation, CookYieldDefault } from '@pops/app-food-db';

import type { MarkCookedInput } from './cook-modal-types.js';

export interface CookFormState {
  scaleFactor: string;
  yieldQty: string;
  yieldUnit: 'g' | 'ml' | 'count';
  location: 'pantry' | 'fridge' | 'freezer' | 'other';
  expiresAt: string;
  rating: number | null;
  notes: string;
  dirty: boolean;
  /**
   * True once the user has manually edited the expires date. While
   * false, the auto-derived value tracks every location change; once
   * true, location changes leave the value alone. Tracked separately
   * from `dirty` so changing the location doesn't lock the expiry.
   */
  expiresAtDirty: boolean;
}

export const initialForm: CookFormState = {
  scaleFactor: '1',
  yieldQty: '',
  yieldUnit: 'g',
  location: 'fridge',
  expiresAt: '',
  rating: null,
  notes: '',
  dirty: false,
  expiresAtDirty: false,
};

export function seedForm(prep: CookPreparation): CookFormState {
  const scale = clampDisplayed(prep.defaultScaleFactor);
  const yieldQty = prep.yieldDefault === null ? '' : displayNumber(prep.yieldDefault.qty * scale);
  const yieldUnit: 'g' | 'ml' | 'count' = prep.yieldDefault?.unit ?? 'g';
  return {
    scaleFactor: displayNumber(scale),
    yieldQty,
    yieldUnit,
    location: 'fridge',
    expiresAt: defaultExpiresAt(prep.yieldDefault, 'fridge'),
    rating: null,
    notes: '',
    dirty: false,
    expiresAtDirty: false,
  };
}

export interface BuildSubmitArgs {
  recipeVersionId: number;
  planEntryId: number | undefined;
  prep: CookPreparation;
  form: CookFormState;
}

export function buildSubmitInput(args: BuildSubmitArgs): MarkCookedInput {
  const scaleFactor = parseDecimal(args.form.scaleFactor, 1);
  const input: MarkCookedInput = {
    recipeVersionId: args.recipeVersionId,
    scaleFactor,
  };
  if (args.planEntryId !== undefined) input.planEntryId = args.planEntryId;
  if (args.form.rating !== null) input.rating = args.form.rating;
  if (args.form.notes.trim().length > 0) input.notes = args.form.notes.trim();
  if (args.prep.yieldsBatch) {
    const yieldInput: NonNullable<MarkCookedInput['yield']> = {
      qty: parseDecimal(args.form.yieldQty, 0),
      unit: args.form.yieldUnit,
      location: args.form.location,
    };
    if (args.form.expiresAt.length > 0) {
      yieldInput.expiresAt = toIsoDateTime(args.form.expiresAt);
    }
    input.yield = yieldInput;
  }
  return input;
}

export function deriveAutoExpires(
  yieldDefault: CookYieldDefault | null,
  location: 'pantry' | 'fridge' | 'freezer' | 'other'
): string {
  return defaultExpiresAt(yieldDefault, location);
}

function defaultExpiresAt(
  yieldDefault: CookYieldDefault | null,
  location: 'pantry' | 'fridge' | 'freezer' | 'other'
): string {
  if (yieldDefault === null) return '';
  const days = shelfLifeDaysFor(yieldDefault, location);
  if (days === null) return '';
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function shelfLifeDaysFor(
  yieldDefault: CookYieldDefault,
  location: 'pantry' | 'fridge' | 'freezer' | 'other'
): number | null {
  if (location === 'fridge') return yieldDefault.shelfLifeFridgeDays;
  if (location === 'freezer') return yieldDefault.shelfLifeFreezerDays;
  return null;
}

function toIsoDateTime(yyyyMmDd: string): string {
  return `${yyyyMmDd}T00:00:00.000Z`;
}

function parseDecimal(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clampDisplayed(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return scale;
}

function displayNumber(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

export function isFormValid(prep: CookPreparation, form: CookFormState): boolean {
  const scale = parseDecimal(form.scaleFactor, NaN);
  if (!Number.isFinite(scale) || scale <= 0) return false;
  if (prep.yieldsBatch) {
    const qty = parseDecimal(form.yieldQty, NaN);
    if (!Number.isFinite(qty) || qty < 0) return false;
  }
  return true;
}
