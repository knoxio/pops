/**
 * PRD-135 — auto-create banner.
 *
 * Lists each `InspectorResolverCreationRow` with a deep link into PRD-122's
 * `/food/data?focus=<slug>` route. Banner is purely informational —
 * approval is never gated on resolving auto-creations (Epic 03 key
 * decision).
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { InspectorResolverCreationRow } from './inspector-wire-types.js';

interface Props {
  creations: readonly InspectorResolverCreationRow[];
}

export function AutoCreateBanner({ creations }: Props): ReactElement | null {
  const { t } = useTranslation('food');
  if (creations.length === 0) return null;
  return (
    <section
      className="space-y-2 rounded-md border bg-muted/40 p-3"
      data-testid="inspector-auto-create-banner"
    >
      <header className="text-sm font-medium">
        {t('inbox.inspector.decision.autoCreate.heading', { count: creations.length })}
      </header>
      <ul className="space-y-1 text-sm">
        {creations.map((row) => (
          <li key={`${row.kind}:${row.slug}`} className="flex items-center justify-between gap-2">
            <Link
              to={`/food/data?focus=${encodeURIComponent(row.slug)}`}
              className="text-primary underline"
              data-testid={`inspector-auto-create-link-${row.slug}`}
            >
              {row.parentIngredientSlug === null
                ? row.slug
                : `${row.parentIngredientSlug} › ${row.slug}`}
            </Link>
            <span className="text-xs text-muted-foreground">
              {t('inbox.inspector.decision.autoCreate.kind', {
                kind: t(`inbox.inspector.decision.autoCreate.kind.${row.kind}`),
                unit: row.defaultUnit,
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
