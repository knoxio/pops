/**
 * Shared mutation-error mapper for the ingredients tab.
 *
 * Service errors flow back as `PillarCallError` whose `.result.kind` is
 * one of `'conflict' | 'bad-request' | ...`. Callers can override the
 * fallback key for context-specific copy (e.g. delete vs. rename uses a
 * different generic message). The `message` heuristic below is used to
 * disambiguate cycle / depth / slug-shape inside the `bad-request` bucket
 * (the router layer sets BAD_REQUEST for all three).
 */
import { isBadRequest, isConflict } from '@pops/pillar-sdk/client';

import type { TFunction } from 'i18next';

interface MapOpts {
  fallbackKey: string;
}

export function mapMutationError(err: unknown, t: TFunction, opts: MapOpts): string {
  if (isConflict(err)) return t('data.ingredients.create.error.slugTaken');
  if (isBadRequest(err)) {
    const message = err.result.message ?? err.message;
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
