/**
 * Conversions tab (PRD-123 Phase C). Two-section page: Unit conversions
 * (top) + Ingredient weights (bottom). Each section is self-contained
 * (own queries, own filters, own dialogs); this file is only the layout.
 */
import { useTranslation } from 'react-i18next';

import { UnitsSection } from './UnitsSection';
import { WeightsSection } from './WeightsSection';

export function ConversionsTabContents() {
  const { t } = useTranslation('food');
  return (
    <div className="space-y-8" aria-label={t('data.conversions.title')}>
      <header className="space-y-1">
        <p className="text-muted-foreground max-w-2xl text-sm">{t('data.conversions.intro')}</p>
      </header>
      <UnitsSection />
      <WeightsSection />
    </div>
  );
}
