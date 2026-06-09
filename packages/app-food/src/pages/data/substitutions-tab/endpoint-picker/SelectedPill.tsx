import { useTranslation } from 'react-i18next';

import type { SubstitutionEndpointInput } from '../types';

export function SelectedPill({
  value,
  onClear,
}: {
  value: SubstitutionEndpointInput;
  onClear: () => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div
      data-testid="endpoint-picker-selected"
      className="bg-muted flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm"
    >
      <span>
        {value.kind === 'ingredient'
          ? t('data.substitutions.endpoint.ingredientPrefix')
          : t('data.substitutions.endpoint.variantPrefix')}
        {' #'}
        {value.id}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground text-xs"
        onClick={onClear}
        aria-label={t('data.substitutions.endpoint.clear')}
      >
        ×
      </button>
    </div>
  );
}
