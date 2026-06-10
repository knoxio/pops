import { useTranslation } from 'react-i18next';
/**
 * Per-recipe card on `/food/solve` — PRD-150.
 *
 * Icon (📗 clean / ⚠ subs needed) + title + status line + sub
 * breakdown + "Cook this" button. The whole card title links to the
 * recipe detail; the Cook this button takes the same route — explicit
 * for screen readers.
 */
import { Link } from 'react-router';

import { Button } from '@pops/ui';

import { InlineSingleSub, SubBreakdownExpander } from './SubBreakdownExpander.js';

import type { ReactElement } from 'react';

import type { SubBreakdownItem } from './SubBreakdownExpander.js';

export interface SolveRecipeRow {
  recipeId: number;
  recipeSlug: string;
  title: string;
  heroImagePath: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  lastCookedAt: string | null;
  subsNeeded: number;
  subs: SubBreakdownItem[];
}

interface SolveRecipeCardProps {
  recipe: SolveRecipeRow;
  /**
   * Pinned `now` for relative-time tests. Omit in production; the
   * card reads `Date.now()` at render time when undefined.
   */
  now?: Date;
}

const MS_PER_DAY = 86_400_000;

function relativeTime(
  t: (key: string, opts?: Record<string, unknown>) => string,
  iso: string | null,
  now: Date
): string {
  if (iso === null) return t('solve.card.neverCooked');
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return t('solve.card.neverCooked');
  const diff = now.getTime() - parsed;
  if (diff < 0) return t('solve.card.lastCooked', { ago: t('solve.card.today') });
  const days = Math.floor(diff / MS_PER_DAY);
  if (days === 0) return t('solve.card.lastCooked', { ago: t('solve.card.today') });
  if (days < 7) return t('solve.card.lastCooked', { ago: t('solve.card.daysAgo', { days }) });
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return t('solve.card.lastCooked', { ago: t('solve.card.weeksAgo', { weeks }) });
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return t('solve.card.lastCooked', { ago: t('solve.card.monthsAgo', { months }) });
  }
  const years = Math.floor(days / 365);
  return t('solve.card.lastCooked', { ago: t('solve.card.yearsAgo', { years }) });
}

function totalMinutes(prep: number | null, cook: number | null): number | null {
  if (prep === null && cook === null) return null;
  return (prep ?? 0) + (cook ?? 0);
}

export function SolveRecipeCard({ recipe, now }: SolveRecipeCardProps): ReactElement {
  const { t } = useTranslation('food');
  const effectiveNow = now ?? new Date();
  const target = `/food/recipes/${recipe.recipeSlug}`;
  const total = totalMinutes(recipe.prepMinutes, recipe.cookMinutes);
  const timeLabel =
    total === null ? t('solve.card.timeUnknown') : t('solve.card.minutes', { minutes: total });

  return (
    <article className="rounded-md border p-4">
      <header className="flex items-center gap-2">
        <span aria-hidden="true">{recipe.subsNeeded === 0 ? '📗' : '⚠'}</span>
        <Link to={target} className="text-lg font-medium hover:underline">
          {recipe.title}
        </Link>
      </header>
      <p className="mt-1 text-sm text-muted-foreground">
        {recipe.subsNeeded === 0
          ? t('solve.card.noSubs')
          : t('solve.card.subsNeeded', { count: recipe.subsNeeded })}
        {' · '}
        {timeLabel}
        {' · '}
        {relativeTime(t, recipe.lastCookedAt, effectiveNow)}
      </p>
      {recipe.subsNeeded === 1 && (
        <div className="mt-1">
          <InlineSingleSub subs={recipe.subs} />
        </div>
      )}
      {recipe.subsNeeded > 1 && (
        <div className="mt-1">
          <SubBreakdownExpander subs={recipe.subs} />
        </div>
      )}
      <div className="mt-3">
        <Button size="sm" asChild>
          <Link to={target}>{t('solve.card.cookThis')}</Link>
        </Button>
      </div>
    </article>
  );
}
