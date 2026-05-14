/** Type selector — used inside the Advanced disclosure of the ingest form. */
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Select } from '@pops/ui';

interface TypeOption {
  value: string;
  label: string;
}

interface TypeSelectorProps {
  value: string;
  options: TypeOption[];
  loading: boolean;
  onChange: (value: string) => void;
}

export function TypeSelector({ value, options, loading, onChange }: TypeSelectorProps) {
  const { t } = useTranslation('cerebrum');
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm h-11">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('ingest.loadingTemplates')}
      </div>
    );
  }

  return (
    <Select
      label={t('ingest.type')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={options}
      placeholder={t('ingest.selectType')}
      aria-label={t('ingest.typeLabel')}
    />
  );
}
