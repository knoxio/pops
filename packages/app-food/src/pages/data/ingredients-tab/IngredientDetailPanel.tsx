/**
 * Right column of the ingredients tab. Shows the selected ingredient's
 * fields and its embedded variants table. CRUD affordances (rename,
 * change parent, delete) land in a follow-up PR; this v1 surface is
 * read + a Create button at the top of the left column.
 */
import { useTranslation } from 'react-i18next';

import { VariantsTable } from './VariantsTable';

import type { IngredientRow, IngredientVariantRow } from '@pops/app-food-db';

interface Props {
  ingredient: IngredientRow;
  variants: readonly IngredientVariantRow[];
  parentName: string | null;
}

export function IngredientDetailPanel({ ingredient, variants, parentName }: Props) {
  const { t } = useTranslation('food');

  return (
    <article aria-label={t('data.ingredients.detailAriaLabel')} className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{ingredient.name}</h2>
        <p className="text-muted-foreground text-xs font-mono">{ingredient.slug}</p>
      </header>

      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t('data.ingredients.fields.parent')}</dt>
        <dd>{parentName ?? '—'}</dd>

        <dt className="text-muted-foreground">{t('data.ingredients.fields.defaultUnit')}</dt>
        <dd>{ingredient.defaultUnit}</dd>

        <dt className="text-muted-foreground">{t('data.ingredients.fields.density')}</dt>
        <dd>{ingredient.densityGPerMl !== null ? `${ingredient.densityGPerMl} g/ml` : '—'}</dd>

        <dt className="text-muted-foreground">{t('data.ingredients.fields.notes')}</dt>
        <dd className="whitespace-pre-wrap">{ingredient.notes ?? '—'}</dd>
      </dl>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide">
          {t('data.ingredients.variants.heading')}
        </h3>
        <VariantsTable variants={variants} />
      </section>
    </article>
  );
}
