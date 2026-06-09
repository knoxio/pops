import { useTranslation } from 'react-i18next';

import { TabPlaceholder } from './TabPlaceholder';

export function ConversionsTab() {
  const { t } = useTranslation('food');
  return (
    <TabPlaceholder
      title={t('data.conversions.title')}
      description={t('data.conversions.description')}
      pendingLabel={t('data.conversions.pending')}
    />
  );
}
