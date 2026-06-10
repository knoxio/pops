/**
 * PRD-145 internal helpers split out of `batches-lifecycle.ts` to keep
 * the main service file under the 200-line per-file lint cap. Not part
 * of the public surface — re-export via the package barrel is
 * intentionally absent.
 */
import { eq } from 'drizzle-orm';

import { ingredientVariants } from '../schema.js';
import { type FoodDb } from './internal.js';

import type { BatchAdjustReason, BatchLocation, BatchUnit } from '../types/batches.js';

/** Max length of the `notes` column we preserve before front-truncating. */
const NOTES_MAX_CHARS = 500;

/**
 * Resolve the auto-default `expires_at` for a (variant, location) pair.
 * Returns null when the variant has no shelf-life days configured for
 * that location (shelf-stable) or when the variant doesn't exist.
 *
 * Shared between `createBatchManual` and `relocateBatch`'s override
 * detection.
 */
export function deriveAutoDefaultExpiry(
  db: FoodDb,
  variantId: number,
  location: BatchLocation,
  producedAt: string
): string | null {
  if (location === 'pantry' || location === 'other') return null;
  const variantRows = db
    .select({
      fridge: ingredientVariants.defaultShelfLifeDaysFridge,
      freezer: ingredientVariants.defaultShelfLifeDaysFreezer,
    })
    .from(ingredientVariants)
    .where(eq(ingredientVariants.id, variantId))
    .all();
  const variant = variantRows[0];
  if (variant === undefined) return null;
  const days = location === 'fridge' ? variant.fridge : variant.freezer;
  if (days === null) return null;
  return addDays(producedAt, days);
}

/**
 * Add whole days to an ISO timestamp. Uses UTC arithmetic so the
 * midnight-boundary tests pin deterministically across timezones.
 */
function addDays(iso: string, days: number): string {
  const base = new Date(iso);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString();
}

/**
 * Today's date as `YYYY-MM-DD`. Used in audit-trail notes appended by
 * relocate / adjust. Date-only (no time) keeps the trail readable.
 */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Append `line` to `existing` notes, separated by a newline, then
 * truncate from the front (so the most recent audit line is preserved)
 * if the combined length exceeds the 500-char cap. Front-truncation is
 * signalled with a leading `…`.
 */
export function appendAuditNote(existing: string | null, line: string): string {
  const combined = existing === null || existing.length === 0 ? line : `${existing}\n${line}`;
  if (combined.length <= NOTES_MAX_CHARS) return combined;
  const overflow = combined.length - NOTES_MAX_CHARS + 1;
  return `…${combined.slice(overflow)}`;
}

export function describeAdjust(reason: BatchAdjustReason, delta: number, unit: BatchUnit): string {
  const abs = Math.abs(delta);
  switch (reason) {
    case 'spoiled':
      return `Spoiled ${abs}${unit} on ${today()}`;
    case 'wasted':
      return `Wasted ${abs}${unit} on ${today()} (e.g. burnt, dropped)`;
    case 'correction': {
      const sign = delta >= 0 ? '+' : '-';
      return `Adjusted by ${sign}${abs}${unit} on ${today()} (correction)`;
    }
  }
}
