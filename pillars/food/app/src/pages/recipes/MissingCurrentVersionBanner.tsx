import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { ReactElement } from 'react';

interface Props {
  slug: string;
}

/**
 * Shown on the detail page when `recipes.current_version_id IS NULL`:
 * links to the drafts page so the user can promote one.
 */
export function MissingCurrentVersionBanner({ slug }: Props): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div
      role="status"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
    >
      <p className="font-medium">{t('recipes.detail.noCurrent.title')}</p>
      <p className="mt-1 text-muted-foreground">{t('recipes.detail.noCurrent.body')}</p>
      <Link
        to={`/food/recipes/${slug}/drafts`}
        className="mt-2 inline-block text-sm font-medium underline"
      >
        {t('recipes.detail.noCurrent.cta')}
      </Link>
    </div>
  );
}
