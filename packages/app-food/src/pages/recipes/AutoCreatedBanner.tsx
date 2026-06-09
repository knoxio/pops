import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

interface Props {
  slugs: readonly string[];
}

/**
 * Shown after a save creates new ingredients/variants via PRD-115's
 * resolver `creations` flow. Links each new slug to
 * `/food/data?focus=<slug>` (PRD-122-B v1 owns the focus deep-link).
 * Dismissible — not persistent.
 */
export function AutoCreatedBanner({ slugs }: Props): ReactElement | null {
  const { t } = useTranslation('food');
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || slugs.length === 0) return null;
  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm"
    >
      <div className="space-y-1">
        <p className="font-medium">
          {t('recipes.edit.autoCreated.title', { count: slugs.length })}
        </p>
        <ul className="flex flex-wrap gap-2">
          {slugs.map((slug) => (
            <li key={slug}>
              <Link
                className="rounded border px-2 py-0.5 underline"
                to={`/food/data?focus=${encodeURIComponent(slug)}`}
              >
                {slug}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-xs underline"
        aria-label={t('recipes.edit.autoCreated.dismiss')}
      >
        {t('recipes.edit.autoCreated.dismiss')}
      </button>
    </div>
  );
}
