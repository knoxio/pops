/**
 * Shared mutation-error mapper for the ingredients tab.
 *
 * Service errors flow back as `FoodApiError` carrying the HTTP status.
 * Callers can override the fallback key for context-specific copy (e.g.
 * delete vs. rename uses a different generic message). The `message`
 * heuristic below disambiguates cycle / depth / slug-shape inside the
 * 400 (bad-request) bucket — the router sets BAD_REQUEST for all three.
 */
import { FoodApiError } from '../../../food-api-helpers.js';

import type { TFunction } from 'i18next';

interface MapOpts {
  fallbackKey: string;
}

function isConflict(err: unknown): err is FoodApiError {
  return err instanceof FoodApiError && err.status === 409;
}

function isBadRequest(err: unknown): err is FoodApiError {
  return err instanceof FoodApiError && err.status === 400;
}

export function mapMutationError(err: unknown, t: TFunction, opts: MapOpts): string {
  if (isConflict(err)) return t('data.ingredients.create.error.slugTaken');
  if (isBadRequest(err)) {
    const message = err.message;
    if (/cycle/i.test(message)) return t('data.ingredients.create.error.cycle');
    if (/depth/i.test(message)) return t('data.ingredients.create.error.hierarchyTooDeep');
    return t('data.ingredients.create.error.invalidSlug');
  }
  return t(opts.fallbackKey);
}

export function mapVariantMutationError(err: unknown, t: TFunction): string {
  if (isConflict(err)) return t('data.ingredients.variants.error.slugTaken');
  if (isBadRequest(err)) return t('data.ingredients.variants.error.invalidSlug');
  return t('data.ingredients.variants.error.generic');
}
