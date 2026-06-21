/**
 * Embedded variants list for the ingredient detail panel.
 *
 * Renders two layouts:
 *   - desktop (≥ 640px): a horizontal table with row actions
 *   - mobile (< 640px): stacked cards per the PRD's "variants table
 *     collapses to stacked cards" requirement
 *
 * Edit / delete buttons hand back to the parent via callbacks; the parent
 * owns the dialog state in `useVariantActions`.
 */
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import type { TFunction } from 'i18next';

import type { IngredientVariantRow } from './ingredient-wire-types.js';

interface Props {
  variants: readonly IngredientVariantRow[];
  onAdd: () => void;
  onEdit: (variant: IngredientVariantRow) => void;
  onDelete: (variant: IngredientVariantRow) => void;
}

export function VariantsTable({ variants, onAdd, onEdit, onDelete }: Props) {
  const { t } = useTranslation('food');
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={onAdd}>
          {t('data.ingredients.variants.actions.add')}
        </Button>
      </div>
      {variants.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('data.ingredients.variants.empty')}</p>
      ) : (
        <>
          <VariantsDesktopTable variants={variants} onEdit={onEdit} onDelete={onDelete} />
          <VariantsMobileList variants={variants} onEdit={onEdit} onDelete={onDelete} />
        </>
      )}
    </div>
  );
}

interface LayoutProps {
  variants: readonly IngredientVariantRow[];
  onEdit: (variant: IngredientVariantRow) => void;
  onDelete: (variant: IngredientVariantRow) => void;
}

function VariantsDesktopTable({ variants, onEdit, onDelete }: LayoutProps) {
  const { t } = useTranslation('food');
  return (
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-3 font-medium">{t('data.ingredients.variants.slug')}</th>
            <th className="py-1 pr-3 font-medium">{t('data.ingredients.variants.name')}</th>
            <th className="py-1 pr-3 font-medium">{t('data.ingredients.variants.unit')}</th>
            <th className="py-1 pr-3 font-medium">{t('data.ingredients.variants.packageSize')}</th>
            <th className="py-1 pr-3 font-medium">{t('data.ingredients.variants.shelfLife')}</th>
            <th className="py-1 pr-3 font-medium sr-only">
              {t('data.ingredients.variants.actions.edit')}
            </th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.id} className="border-b">
              <td className="py-1 pr-3 font-mono text-xs">{v.slug}</td>
              <td className="py-1 pr-3">{v.name}</td>
              <td className="py-1 pr-3">{v.defaultUnit}</td>
              <td className="py-1 pr-3">{v.packageSizeG ?? '—'}</td>
              <td className="py-1 pr-3 text-muted-foreground text-xs">
                {formatShelfLife(t, v.defaultShelfLifeDaysFridge, v.defaultShelfLifeDaysFreezer)}
              </td>
              <td className="py-1 pr-3">
                <RowActions onEdit={() => onEdit(v)} onDelete={() => onDelete(v)} variant={v} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VariantsMobileList({ variants, onEdit, onDelete }: LayoutProps) {
  const { t } = useTranslation('food');
  return (
    <ul className="space-y-2 sm:hidden">
      {variants.map((v) => (
        <li
          key={v.id}
          aria-label={t('data.ingredients.variants.actions.rowAriaLabel', { slug: v.slug })}
          className="border rounded-md p-3 text-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium">{v.name}</div>
              <div className="text-muted-foreground font-mono text-xs">{v.slug}</div>
            </div>
            <RowActions onEdit={() => onEdit(v)} onDelete={() => onDelete(v)} variant={v} />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
            <dt className="text-muted-foreground">{t('data.ingredients.variants.unit')}</dt>
            <dd>{v.defaultUnit}</dd>
            <dt className="text-muted-foreground">{t('data.ingredients.variants.packageSize')}</dt>
            <dd>{v.packageSizeG ?? '—'}</dd>
            <dt className="text-muted-foreground">{t('data.ingredients.variants.shelfLife')}</dt>
            <dd>
              {formatShelfLife(t, v.defaultShelfLifeDaysFridge, v.defaultShelfLifeDaysFreezer)}
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function RowActions({
  onEdit,
  onDelete,
  variant,
}: {
  onEdit: () => void;
  onDelete: () => void;
  variant: IngredientVariantRow;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={onEdit}
        aria-label={t('data.ingredients.variants.actions.edit') + ' ' + variant.slug}
      >
        {t('data.ingredients.variants.actions.edit')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        aria-label={t('data.ingredients.variants.actions.delete') + ' ' + variant.slug}
      >
        {t('data.ingredients.variants.actions.delete')}
      </Button>
    </div>
  );
}

function formatShelfLife(t: TFunction, fridge: number | null, freezer: number | null): string {
  const parts: string[] = [];
  if (fridge !== null) {
    parts.push(t('data.ingredients.variants.shelfLifeFridge', { days: fridge }));
  }
  if (freezer !== null) {
    parts.push(t('data.ingredients.variants.shelfLifeFreezer', { days: freezer }));
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}
