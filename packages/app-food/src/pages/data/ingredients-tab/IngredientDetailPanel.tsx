/**
 * Right column of the ingredients tab. Shows the selected ingredient's
 * fields, action buttons (rename / change-parent / delete), the embedded
 * variants list, and the recipe-refs section.
 *
 * The panel itself is presentation + light orchestration; the dialogs,
 * mutations, and query state live in the per-concern hooks
 * (`useIngredientActions`, `useVariantActions`).
 */
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { IngredientTagsEditor } from './IngredientTagsEditor';
import { RecipeRefsSection } from './RecipeRefsSection';
import { VariantsTable } from './VariantsTable';

import type { IngredientRow, IngredientVariantRow } from './ingredient-wire-types.js';

interface ActionsApi {
  onRename: () => void;
  onChangeParent: () => void;
  onDelete: () => void;
  isBusy: boolean;
}

interface VariantsApi {
  onAdd: () => void;
  onEdit: (variant: IngredientVariantRow) => void;
  onDelete: (variant: IngredientVariantRow) => void;
}

interface Props {
  ingredient: IngredientRow;
  variants: readonly IngredientVariantRow[];
  parentName: string | null;
  actions: ActionsApi;
  variantsApi: VariantsApi;
}

export function IngredientDetailPanel(props: Props) {
  const { t } = useTranslation('food');
  return (
    <article aria-label={t('data.ingredients.detailAriaLabel')} className="space-y-4">
      <DetailHeader ingredient={props.ingredient} actions={props.actions} />
      <DetailFields ingredient={props.ingredient} parentName={props.parentName} />
      <section aria-label={t('data.ingredients.variants.heading')}>
        <h3 className="text-sm font-semibold uppercase tracking-wide">
          {t('data.ingredients.variants.heading')}
        </h3>
        <VariantsTable
          variants={props.variants}
          onAdd={props.variantsApi.onAdd}
          onEdit={props.variantsApi.onEdit}
          onDelete={props.variantsApi.onDelete}
        />
      </section>
      <IngredientTagsEditor ingredientId={props.ingredient.id} />
      <RecipeRefsSection ingredientId={props.ingredient.id} />
    </article>
  );
}

function DetailHeader({ ingredient, actions }: { ingredient: IngredientRow; actions: ActionsApi }) {
  const { t } = useTranslation('food');
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold">{ingredient.name}</h2>
        <p className="text-muted-foreground text-xs font-mono">{ingredient.slug}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button size="sm" variant="outline" onClick={actions.onRename} disabled={actions.isBusy}>
          {t('data.ingredients.actions.rename')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={actions.onChangeParent}
          disabled={actions.isBusy}
        >
          {t('data.ingredients.actions.changeParent')}
        </Button>
        <Button size="sm" variant="outline" onClick={actions.onDelete} disabled={actions.isBusy}>
          {t('data.ingredients.actions.delete')}
        </Button>
      </div>
    </header>
  );
}

function DetailFields({
  ingredient,
  parentName,
}: {
  ingredient: IngredientRow;
  parentName: string | null;
}) {
  const { t } = useTranslation('food');
  return (
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
  );
}
