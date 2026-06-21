import { Utensils } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, cn, EmptyState } from '@pops/ui';

import { RecipeHeader } from './RecipeHeader';
import { RecipeIngredientList } from './RecipeIngredientList';
import { clampScaleFactor, formatQty } from './RecipeRenderer.helpers';
import { RecipeStepList } from './RecipeStepList';

import type { RecipeRendererProps, RecipeVersionWithCompiledData } from './recipe-render-types.js';

export type {
  RecipeLineWithResolved,
  RecipeRendererProps,
  RecipeRendererVariant,
  RecipeVersionWithCompiledData,
} from './recipe-render-types.js';

/**
 * Cookbook-styled read view of a compiled recipe. Pure presentation —
 * `recipeVersion` is the full joined payload built server-side.
 *
 * Renders the "not yet compiled" placeholder for any non-`compiled`
 * status; renders the archived banner for any recipe with `archived_at`.
 *
 * `variant='compact'` is the list-card preview — a single row with thumb
 * + title + quick facts.
 */
export function RecipeRenderer({
  recipeVersion,
  scaleFactor,
  onTimerStart,
  variant = 'detail',
  className,
}: RecipeRendererProps) {
  const safeScale = clampScaleFactor(scaleFactor);

  if (recipeVersion.version.compileStatus !== 'compiled') {
    return <UncompiledPlaceholder className={className} />;
  }

  if (variant === 'compact') {
    return <CompactRecipeCard data={recipeVersion} scaleFactor={safeScale} className={className} />;
  }

  return (
    <DetailLayout
      data={recipeVersion}
      scaleFactor={safeScale}
      onTimerStart={onTimerStart}
      className={className}
    />
  );
}

interface DetailLayoutProps {
  data: RecipeVersionWithCompiledData;
  scaleFactor: number;
  onTimerStart?: (durationMinutes: number, stepPosition: number) => void;
  className?: string;
}

function DetailLayout({ data, scaleFactor, onTimerStart, className }: DetailLayoutProps) {
  const { t } = useTranslation('food');
  const isArchived = data.recipe.archivedAt !== null;

  return (
    <article
      className={cn('space-y-6 p-4 sm:p-6', className)}
      data-testid="recipe-renderer"
      data-variant="detail"
    >
      {isArchived ? (
        <Alert
          variant="default"
          className="border-warning text-warning-foreground"
          data-testid="archived-banner"
        >
          <AlertDescription>{t('renderer.archivedBanner')}</AlertDescription>
        </Alert>
      ) : null}
      <HeroImage data={data} />
      <RecipeHeader data={data} scaleFactor={scaleFactor} />
      <RecipeIngredientList lines={data.lines} scaleFactor={scaleFactor} />
      <RecipeStepList steps={data.steps} lines={data.lines} onTimerStart={onTimerStart} />
    </article>
  );
}

function HeroImage({ data }: { data: RecipeVersionWithCompiledData }) {
  const { t } = useTranslation('food');
  const [errored, setErrored] = useState(false);
  const path = data.recipe.heroImagePath;

  if (path === null || errored) {
    return (
      <div
        className="bg-muted text-muted-foreground flex h-48 items-center justify-center rounded-lg"
        data-testid="hero-placeholder"
      >
        <Utensils className="h-12 w-12" aria-label={t('renderer.placeholderAlt')} />
      </div>
    );
  }

  return (
    <img
      src={`/api/food/recipes/${path}`}
      alt={t('renderer.heroAlt', { title: data.version.title })}
      onError={() => setErrored(true)}
      className="h-48 w-full rounded-lg object-cover"
      data-testid="hero-image"
    />
  );
}

interface CompactRecipeCardProps {
  data: RecipeVersionWithCompiledData;
  scaleFactor: number;
  className?: string;
}

function CompactRecipeCard({ data, scaleFactor, className }: CompactRecipeCardProps) {
  const { t } = useTranslation('food');
  const totalMin = (data.version.prepMinutes ?? 0) + (data.version.cookMinutes ?? 0);
  const scaledServings =
    typeof data.version.servings === 'number'
      ? Math.round(data.version.servings * scaleFactor)
      : null;

  return (
    <article
      className={cn('flex items-center gap-3 rounded-lg border p-3 text-sm', className)}
      data-testid="recipe-renderer"
      data-variant="compact"
    >
      <CompactThumb data={data} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold">{data.version.title}</h3>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {totalMin > 0 ? t('renderer.prepMinutes', { count: totalMin }) : null}
          {scaledServings !== null
            ? ` · ${t('renderer.servings', { count: scaledServings })}`
            : null}
        </p>
        {data.yieldIngredient ? (
          <p className="text-muted-foreground truncate text-xs">
            {t('renderer.yieldLabel', {
              label: formatCompactYield(data, scaleFactor),
            })}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function CompactThumb({ data }: { data: RecipeVersionWithCompiledData }) {
  const { t } = useTranslation('food');
  const [errored, setErrored] = useState(false);
  const path = data.recipe.heroImagePath;
  const thumbPath = path ? path.replace(/hero\.(jpe?g|png|webp)$/i, 'hero-thumb.webp') : null;

  if (!thumbPath || errored) {
    return (
      <div
        className="bg-muted text-muted-foreground flex h-12 w-12 shrink-0 items-center justify-center rounded"
        data-testid="hero-placeholder"
      >
        <Utensils className="h-6 w-6" aria-label={t('renderer.placeholderAlt')} />
      </div>
    );
  }

  return (
    <img
      src={`/api/food/recipes/${thumbPath}`}
      alt={t('renderer.heroAlt', { title: data.version.title })}
      onError={() => setErrored(true)}
      className="h-12 w-12 shrink-0 rounded object-cover"
      data-testid="hero-image"
    />
  );
}

function formatCompactYield(data: RecipeVersionWithCompiledData, scaleFactor: number): string {
  const ing = data.yieldIngredient;
  if (!ing) return '';
  const qty = data.version.yieldQty;
  const unit = data.version.yieldUnit;
  if (qty === null || unit === null) return ing.name;
  return `${ing.name} (${formatQty(qty * scaleFactor)} ${unit})`;
}

function UncompiledPlaceholder({ className }: { className?: string }) {
  const { t } = useTranslation('food');

  return (
    <div className={cn('p-6', className)} data-testid="recipe-uncompiled">
      <EmptyState
        title={t('renderer.notRendered.title')}
        description={t('renderer.notRendered.description')}
        size="md"
      />
    </div>
  );
}
