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
