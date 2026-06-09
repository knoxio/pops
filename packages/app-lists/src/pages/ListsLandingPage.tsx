import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pops/ui';

/**
 * Placeholder landing page at `/lists`. PRD-140 turns this into the real list
 * index once `lists.list.*` / `lists.items.*` tRPC procedures land. Keeping
 * the route mountable from day one means PRD-139 can ship independently of
 * any consumer module.
 *
 * No data fetching so the page is usable the moment the module is installed.
 */
export function ListsLandingPage() {
  const { t } = useTranslation('lists');

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
            <CardTitle>{t('browse.title')}</CardTitle>
            <CardDescription>{t('browse.description')}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t('status.comingSoon')}
          </CardContent>
        </Card>

        <Card aria-disabled className="opacity-70">
          <CardHeader>
            <CardTitle>{t('newList.title')}</CardTitle>
            <CardDescription>{t('newList.description')}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t('status.comingSoon')}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
