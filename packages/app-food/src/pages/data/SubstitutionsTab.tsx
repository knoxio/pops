import { useTranslation } from 'react-i18next';

import { TabPlaceholder } from './TabPlaceholder.js';

export function SubstitutionsTab() {
  const { t } = useTranslation('food');
  return (
    <TabPlaceholder
      title={t('data.substitutions.title')}
      description={t('data.substitutions.description')}
      pendingLabel={t('data.pending')}
    />
  );
}
