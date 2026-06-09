import { useTranslation } from 'react-i18next';

import type { SubstitutionEndpointKind } from '../types';

export function KindToggle({
  kind,
  onChange,
}: {
  kind: SubstitutionEndpointKind;
  onChange: (next: SubstitutionEndpointKind) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div
      role="radiogroup"
      aria-label={t('data.substitutions.endpoint.kindAria')}
      className="flex gap-2 text-xs"
    >
      {(['ingredient', 'variant'] as const).map((k) => (
        <label key={k} className="flex items-center gap-1">
          <input
            type="radio"
            checked={kind === k}
            onChange={() => onChange(k)}
            aria-label={t(`data.substitutions.endpoint.kind.${k}`)}
          />
          <span>{t(`data.substitutions.endpoint.kind.${k}`)}</span>
        </label>
      ))}
    </div>
  );
}
