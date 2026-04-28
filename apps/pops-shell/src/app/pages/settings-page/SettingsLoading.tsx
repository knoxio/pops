import { useTranslation } from 'react-i18next';

import { Skeleton } from '@pops/ui';

export function SettingsLoading() {
  return (
    <div className="flex gap-8 p-6 max-w-5xl mx-auto">
      <div className="w-48 shrink-0 space-y-2">
        {['s1', 's2', 's3', 's4'].map((id) => (
          <Skeleton key={id} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex-1 space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

export function SettingsEmpty() {
  const { t } = useTranslation('shell');

  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      {t('noSettingsRegistered')}
    </div>
  );
}
