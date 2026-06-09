import { useTranslation } from 'react-i18next';

/**
 * Placeholder landing page at `/lists`. PRD-140 turns this into the real list
 * index once `lists.list.*` / `lists.items.*` tRPC procedures land. Keeping
 * the route mountable from day one means PRD-139 can ship independently of
 * any consumer module.
 *
 * Plain HTML on purpose: app-lists is consumed by pops-api transitively (via
 * `@pops/app-food-db` → `@pops/app-lists/db`), and the pops-api Docker image
 * intentionally doesn't ship frontend dep trees. Pulling `@pops/ui` here
 * would force the pops-api image to resolve every shadcn/Radix transitive,
 * for code it never runs. The shell's Tailwind preset still styles these
 * utility classes the same way it does for `@pops/ui` Cards.
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
        <article
          aria-disabled
          className="bg-card text-card-foreground rounded-lg border opacity-70 shadow-sm"
        >
          <div className="flex flex-col space-y-1.5 p-6">
            <h2 className="text-2xl leading-none font-semibold tracking-tight">
              {t('browse.title')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('browse.description')}</p>
          </div>
          <div className="text-muted-foreground p-6 pt-0 text-sm">{t('status.comingSoon')}</div>
        </article>

        <article
          aria-disabled
          className="bg-card text-card-foreground rounded-lg border opacity-70 shadow-sm"
        >
          <div className="flex flex-col space-y-1.5 p-6">
            <h2 className="text-2xl leading-none font-semibold tracking-tight">
              {t('newList.title')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('newList.description')}</p>
          </div>
          <div className="text-muted-foreground p-6 pt-0 text-sm">{t('status.comingSoon')}</div>
        </article>
      </section>
    </div>
  );
}
