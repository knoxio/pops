import { FoodApiError } from '../../../food-api-helpers.js';

import type { TFunction } from 'i18next';

export function mapMutationError(err: unknown, t: TFunction): string {
  if (err instanceof FoodApiError) {
    if (err.status === 409) return t('data.substitutions.error.duplicate');
    if (err.status === 404) return t('data.substitutions.error.notFound');
    if (err.status === 400) {
      if (/self/i.test(err.message)) return t('data.substitutions.error.self');
      if (/scope/i.test(err.message)) return t('data.substitutions.error.scope');
      if (/endpoint/i.test(err.message)) return t('data.substitutions.error.endpoint');
      return t('data.substitutions.error.badRequest');
    }
  }
  return t('data.substitutions.error.generic');
}
