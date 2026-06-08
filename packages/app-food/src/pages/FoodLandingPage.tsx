import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pops/ui';

/**
 * Placeholder landing page at `/food`. Replaced incrementally as the
 * Epic 01 PRDs (119 Recipes, 122 Manage data) land — this page becomes a
 * dashboard pointing to the new sub-surfaces.
 *
 * No data fetching at this stage so the route is usable the moment the
 * package is installed.
 */
export function FoodLandingPage() {
  const { t } = useTranslation('food');

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground max-w-2xl">{t('intro')}</p>
      </header>

      <section
        aria-label={t('comingSoon.heading')}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Card aria-disabled className="opacity-70">
          <CardHeader>
            <CardTitle>{t('recipes.title')}</CardTitle>
            <CardDescription>{t('recipes.description')}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t('status.comingSoon')}
          </CardContent>
        </Card>

        <Card aria-disabled className="opacity-70">
          <CardHeader>
            <CardTitle>{t('data.title')}</CardTitle>
            <CardDescription>{t('data.description')}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t('status.comingSoon')}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
