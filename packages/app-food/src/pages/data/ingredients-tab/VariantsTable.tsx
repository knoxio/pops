/**
 * Embedded variants table for the ingredient detail panel.
 *
 * v1 is read-only — inline editing lands in a follow-up PR. The PRD's
 * variant CRUD AC remains unchecked at the page level until then; this
 * surface shows the data so downstream filtering / curation can decide
 * what to act on.
 */
import { useTranslation } from 'react-i18next';

import type { IngredientVariantRow } from '@pops/app-food-db';

interface Props {
  variants: readonly IngredientVariantRow[];
}

export function VariantsTable({ variants }: Props) {
  const { t } = useTranslation('food');

  if (variants.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('data.ingredients.variants.empty')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-3 font-medium">{t('data.ingredients.variants.slug')}</th>
            <th className="py-1 pr-3 font-medium">{t('data.ingredients.variants.name')}</th>
            <th className="py-1 pr-3 font-medium">{t('data.ingredients.variants.unit')}</th>
            <th className="py-1 pr-3 font-medium">{t('data.ingredients.variants.packageSize')}</th>
            <th className="py-1 pr-3 font-medium">{t('data.ingredients.variants.shelfLife')}</th>
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
                {formatShelfLife(v.defaultShelfLifeDaysFridge, v.defaultShelfLifeDaysFreezer)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatShelfLife(fridge: number | null, freezer: number | null): string {
  const parts: string[] = [];
  if (fridge !== null) parts.push(`fridge ${fridge}d`);
  if (freezer !== null) parts.push(`freezer ${freezer}d`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}
