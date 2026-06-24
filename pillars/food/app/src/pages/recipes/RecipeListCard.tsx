import { Link } from 'react-router';

import { Badge } from '@pops/ui';

import type { ReactElement } from 'react';

import type { RecipeListItemView } from './useRecipeListQuery.js';

interface Props {
  item: RecipeListItemView;
  /** Translation function so the card is locale-agnostic. */
  t: (key: string, opts?: Record<string, unknown>) => string;
}

/**
 * Compact list-page card. NOT `RecipeRenderer` — that requires the
 * compiled lines + steps + JOINs. This card renders the wire-shape
 * `RecipeListItem` only and lets the user navigate to the detail page.
 */
export function RecipeListCard({ item, t }: Props): ReactElement {
  const status = badgeForStatus(item, t);
  const summary = summaryLine(item, t);
  return (
    <Link
      to={`/food/recipes/${item.slug}`}
      aria-label={item.title ?? item.slug}
      className="block overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent/40"
    >
      <article className="flex gap-4 p-4">
        <Thumbnail heroImagePath={item.heroImagePath} alt={item.title ?? item.slug} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-semibold leading-tight">
              {item.title ?? item.slug}
            </h3>
            {status && <Badge variant={status.variant}>{status.label}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{summary}</p>
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {item.tags.slice(0, 4).map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
              {item.tags.length > 4 && (
                <span className="text-xs text-muted-foreground">
                  {t('recipes.list.card.moreTags', { count: item.tags.length - 4 })}
                </span>
              )}
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}

function Thumbnail({
  heroImagePath,
  alt,
}: {
  heroImagePath: string | null;
  alt: string;
}): ReactElement {
  if (heroImagePath === null) {
    return (
      <div
        aria-hidden
        className="h-20 w-20 shrink-0 rounded bg-muted"
        data-testid="recipe-card-thumb-fallback"
      />
    );
  }
  // hero_image_path is stored as `<recipeId>/hero.<ext>`; the card
  // variant lives at `<recipeId>/hero-card.webp`, derived client-side.
  const cardPath = heroImagePath.replace(/hero\.[^.]+$/, 'hero-card.webp');
  return (
    <img
      src={`/api/food/recipes/${cardPath}`}
      alt={alt}
      loading="lazy"
      className="h-20 w-20 shrink-0 rounded object-cover"
    />
  );
}

function badgeForStatus(
  item: RecipeListItemView,
  t: (key: string) => string
): { variant: 'destructive' | 'outline' | 'secondary'; label: string } | null {
  if (item.archivedAt !== null) {
    return { variant: 'destructive', label: t('recipes.list.card.archived') };
  }
  if (!item.hasCurrentVersion) {
    return { variant: 'outline', label: t('recipes.list.card.draftOnly') };
  }
  return null;
}

function summaryLine(
  item: RecipeListItemView,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const parts: string[] = [];
  if (item.prepMinutes !== null) parts.push(t('recipes.list.card.prep', { min: item.prepMinutes }));
  if (item.cookMinutes !== null) parts.push(t('recipes.list.card.cook', { min: item.cookMinutes }));
  if (item.servings !== null) parts.push(t('recipes.list.card.servings', { count: item.servings }));
  parts.push(t(`recipes.types.${item.recipeType}`));
  return parts.join(' · ');
}
