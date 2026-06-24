import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { formatQty } from './format-qty.js';

import type { GeneratorItem } from './types.js';

interface FromPlanItemProps {
  item: GeneratorItem;
  showTagItLink: boolean;
}

export function FromPlanItem({ item, showTagItLink }: FromPlanItemProps): ReactElement {
  const { t } = useTranslation('food');
  const variantSuffix = item.variantName === null ? '' : ` (${item.variantName})`;
  const buyQty = formatQty(item.buyQty);
  const needQty = formatQty(item.needQty);
  const haveQty = formatQty(item.pantryQty);
  const unit = item.isUnconverted ? (item.originalUnit ?? '') : item.canonicalUnit;

  return (
    <li
      className="flex items-start justify-between gap-3 py-2"
      data-testid="from-plan-item"
      data-ingredient-id={item.ingredientId}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {item.ingredientName}
          {variantSuffix}
        </div>
        {item.isUnconverted ? (
          <div className="text-xs text-muted-foreground">
            {t('shopping.fromPlan.unconvertedHint')}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {t('shopping.fromPlan.itemNeedHave', {
              need: needQty,
              have: haveQty,
              unit: item.canonicalUnit,
            })}
          </div>
        )}
        {showTagItLink ? (
          <Link
            to={`/food/data/ingredients?focus=${String(item.ingredientId)}`}
            className="text-xs text-amber-600 hover:underline"
            data-testid="tag-it-link"
          >
            {t('shopping.fromPlan.tagItLink')}
          </Link>
        ) : null}
      </div>
      <div className="text-right whitespace-nowrap font-mono">
        {t('shopping.fromPlan.itemBuyQty', { qty: buyQty, unit })}
      </div>
    </li>
  );
}
