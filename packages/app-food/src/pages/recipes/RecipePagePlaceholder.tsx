import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardHeader, CardTitle } from '@pops/ui';

/**
 * Placeholder mounted on the recipe sub-routes (`/food/recipes/new`,
 * `/food/recipes/:slug`, ...) that PRD-119 sub-PRs B/C/D haven't filled
 * yet. Keeping the routes wired prevents broken links from the list page
 * + future deep-links during the staged rollout.
 */
export function RecipePagePlaceholder() {
  const { t } = useTranslation('food');
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('recipes.placeholder.title')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t('recipes.placeholder.body')}
        </CardContent>
      </Card>
    </div>
  );
}
