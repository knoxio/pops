import { useTranslation } from 'react-i18next';

import { TabPlaceholder } from './TabPlaceholder';

export function AliasesTab() {
  const { t } = useTranslation('food');
  return (
    <TabPlaceholder
      title={t('data.aliases.title')}
      description={t('data.aliases.description')}
      pendingLabel={t('data.pending')}
    />
  );
}
