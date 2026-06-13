/**
 * "Used by recipes" section of the ingredient detail panel.
 *
 * Queries `food.ingredients.recipeRefs` for the selected ingredient and
 * shows the count + a collapsible list of recipes. Recipe entries link to
 * `/food/recipes/<slug>` (the PRD-119 page; until that route exists the
 * link still renders but lands on a 404 placeholder).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { usePillarQuery } from '@pops/pillar-sdk/react';
import { Button } from '@pops/ui';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

type RecipeRefsOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['recipeRefs'];

interface Props {
  ingredientId: number;
}

export function RecipeRefsSection({ ingredientId }: Props) {
  const { t } = useTranslation('food');
  const [open, setOpen] = useState(false);
  const query = usePillarQuery<RecipeRefsOutput>('food', ['ingredients', 'recipeRefs'], {
    id: ingredientId,
  });

  if (query.isLoading) {
    return <p className="text-muted-foreground text-sm">{t('data.ingredients.loading')}</p>;
  }
  const data = query.data ?? { count: 0, recipes: [] };

  return (
    <section aria-label={t('data.ingredients.recipeRefs.heading')}>
      <h3 className="text-sm font-semibold uppercase tracking-wide">
        {t('data.ingredients.recipeRefs.heading')}
      </h3>
      {data.count === 0 ? (
        <p className="text-muted-foreground text-sm">{t('data.ingredients.recipeRefs.zero')}</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm" data-testid="recipe-refs-count">
              {t('data.ingredients.recipeRefs.count', { count: data.count })}
            </span>
            <Button size="sm" variant="outline" onClick={() => setOpen((prev) => !prev)}>
              {open ? t('data.ingredients.recipeRefs.hide') : t('data.ingredients.recipeRefs.show')}
            </Button>
          </div>
          {open ? (
            <ul className="list-disc pl-5 text-sm">
              {data.recipes.map((row) => (
                <li key={row.recipeId}>
                  <Link
                    to={`/food/recipes/${row.recipeSlug}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {row.recipeTitle}
                  </Link>{' '}
                  <span className="text-muted-foreground text-xs font-mono">
                    ({row.recipeSlug})
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
