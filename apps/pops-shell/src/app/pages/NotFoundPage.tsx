import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

export function NotFoundPage() {
  const { t } = useTranslation('shell');

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <FileQuestion className="h-16 w-16 text-muted-foreground/40 mb-6" />
      <h1 className="text-2xl font-bold mb-2">{t('pageNotFound')}</h1>
      <p className="text-muted-foreground mb-6">{t('pageNotFoundDescription')}</p>
      <Button asChild>
        <Link to="/">{t('goHome')}</Link>
      </Button>
    </div>
  );
}
