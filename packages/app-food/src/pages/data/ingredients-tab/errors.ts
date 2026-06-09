/**
 * Shared mutation-error mapper for the ingredients tab.
 *
 * tRPC's `TRPCError` collapses several distinct service errors onto the same
 * `code`. The router layer (PRD-122-API) sets BAD_REQUEST for slug-shape +
 * cycle + depth errors and CONFLICT for slug-registry collisions. Callers
 * can override the fallback key for context-specific copy (e.g. delete
 * vs. rename uses a different generic message).
 */
import type { TFunction } from 'i18next';

interface MapOpts {
  fallbackKey: string;
}

interface TrpcError {
  data?: { code?: string } | null;
  message: string;
}

export function mapMutationError(err: TrpcError, t: TFunction, opts: MapOpts): string {
  const code = err.data?.code;
  if (code === 'CONFLICT') return t('data.ingredients.create.error.slugTaken');
  if (code === 'BAD_REQUEST') {
    if (/cycle/i.test(err.message)) return t('data.ingredients.create.error.cycle');
    if (/depth/i.test(err.message)) return t('data.ingredients.create.error.hierarchyTooDeep');
    return t('data.ingredients.create.error.invalidSlug');
  }
  return t(opts.fallbackKey);
}

export function mapVariantMutationError(err: TrpcError, t: TFunction): string {
  const code = err.data?.code;
  if (code === 'CONFLICT') return t('data.ingredients.variants.error.slugTaken');
  if (code === 'BAD_REQUEST') return t('data.ingredients.variants.error.invalidSlug');
  return t('data.ingredients.variants.error.generic');
}
