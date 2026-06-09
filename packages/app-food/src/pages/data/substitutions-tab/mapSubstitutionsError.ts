import type { TFunction } from 'i18next';

interface TrpcLikeError {
  data?: { code?: string } | null;
  message: string;
}

export function mapMutationError(err: TrpcLikeError, t: TFunction): string {
  const code = err.data?.code;
  if (code === 'CONFLICT') return t('data.substitutions.error.duplicate');
  if (code === 'NOT_FOUND') return t('data.substitutions.error.notFound');
  if (code === 'BAD_REQUEST') {
    if (/self/i.test(err.message)) return t('data.substitutions.error.self');
    if (/scope/i.test(err.message)) return t('data.substitutions.error.scope');
    if (/endpoint/i.test(err.message)) return t('data.substitutions.error.endpoint');
    return t('data.substitutions.error.badRequest');
  }
  return t('data.substitutions.error.generic');
}
