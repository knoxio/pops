/**
 * Inline badge marking a conversion row as having come from PRD-113's
 * seed. Re-rendered on every row; kept tiny so it inlines cleanly.
 */
import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

export function SeededBadge() {
  const { t } = useTranslation('food');
  return (
    <Badge variant="secondary" aria-label={t('data.conversions.seeded')}>
      {t('data.conversions.seeded')}
    </Badge>
  );
}
