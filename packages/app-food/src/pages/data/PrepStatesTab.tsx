import { useTranslation } from 'react-i18next';

import { TabPlaceholder } from './TabPlaceholder';

export function PrepStatesTab() {
  const { t } = useTranslation('food');
  return (
    <TabPlaceholder
      title={t('data.prepStates.title')}
      description={t('data.prepStates.description')}
      pendingLabel={t('data.pending')}
    />
  );
}
