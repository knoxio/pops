import { useTranslation } from 'react-i18next';

import { TabPlaceholder } from './TabPlaceholder.js';

export function IngredientsTab() {
  const { t } = useTranslation('food');
  return (
    <TabPlaceholder
      title={t('data.ingredients.title')}
      description={t('data.ingredients.description')}
      pendingLabel={t('data.pending')}
    />
  );
}
