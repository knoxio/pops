import { useTranslation } from 'react-i18next';

import { CreateSubstitutionForm } from './CreateSubstitutionForm';
import { SubstitutionsFilters } from './SubstitutionsFilters';
import { SubstitutionsTable } from './SubstitutionsTable';
import { useSubstitutionsTab } from './useSubstitutionsTab';

export function SubstitutionsTabContents() {
  const { t } = useTranslation('food');
  const state = useSubstitutionsTab();

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          {t('data.substitutions.title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('data.substitutions.description')}</p>
        <p className="text-muted-foreground text-xs">{t('data.substitutions.recipePickerHint')}</p>
      </header>
      <CreateSubstitutionForm
        isSubmitting={state.isCreating}
        errorMessage={state.createError}
        onSubmit={state.submitCreate}
      />
      <SubstitutionsFilters
        filters={state.filters}
        onChange={state.setFilters}
        onReset={state.resetFilters}
      />
      <SubstitutionsTable
        rows={state.rows}
        isLoading={state.isLoading}
        isUpdating={state.isUpdating}
        isDeleting={state.isDeleting}
        rowError={state.rowError}
        onUpdate={state.submitUpdate}
        onDelete={state.submitDelete}
      />
    </div>
  );
}
