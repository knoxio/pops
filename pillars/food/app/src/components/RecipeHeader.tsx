import { Clock, Flame, Utensils } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

import { buildYieldLabel, formatQty } from './RecipeRenderer.helpers';

import type { RecipeVersionWithCompiledData } from './recipe-render-types.js';

/**
 * Renders the page-level header for `variant='detail'` — title, version
 * chip, summary, prep / cook / servings icons, yield label, recipe tags.
 *
 * `scaleFactor` only affects `servings` (rounded to nearest whole per AC
 * line 148) and the yield qty in the label. Prep / cook times are immune
 * — same rule as step body timers.
 */
export interface RecipeHeaderProps {
  data: RecipeVersionWithCompiledData;
  scaleFactor: number;
}

export function RecipeHeader({ data, scaleFactor }: RecipeHeaderProps) {
  const { version, tags } = data;
  return (
    <header className="space-y-3" data-testid="recipe-header">
      <TitleRow data={data} />
      {version.summary ? (
        <p className="text-muted-foreground max-w-2xl">{version.summary}</p>
      ) : null}
      <FactsRow data={data} scaleFactor={scaleFactor} />
      <YieldLine data={data} scaleFactor={scaleFactor} />
      {tags.length > 0 ? <TagsRow tags={tags} /> : null}
    </header>
  );
}

function TitleRow({ data }: { data: RecipeVersionWithCompiledData }) {
  const { t } = useTranslation('food');
  const { version } = data;
  const versionTooltip = version.compiledAt
    ? t('renderer.versionTooltip', {
        status: version.status,
        compiledAt: version.compiledAt,
      })
    : t('renderer.versionTooltipUncompiled', { status: version.status });

  return (
    <div className="flex items-baseline gap-3">
      <h1 className="text-3xl font-bold tracking-tight">{version.title}</h1>
      <Badge variant="secondary" title={versionTooltip} data-testid="recipe-version-chip">
        {t('renderer.versionLabel', { versionNo: version.versionNo })}
      </Badge>
    </div>
  );
}

function FactsRow({
  data,
  scaleFactor,
}: {
  data: RecipeVersionWithCompiledData;
  scaleFactor: number;
}) {
  const { t } = useTranslation('food');
  const { version } = data;
  const scaledServings =
    typeof version.servings === 'number' ? Math.round(version.servings * scaleFactor) : null;

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
      {typeof version.prepMinutes === 'number' ? (
        <span className="inline-flex items-center gap-1" data-testid="recipe-prep">
          <Clock className="h-4 w-4" aria-hidden="true" />
          {t('renderer.prepMinutes', { count: version.prepMinutes })}
        </span>
      ) : null}
      {typeof version.cookMinutes === 'number' ? (
        <span className="inline-flex items-center gap-1" data-testid="recipe-cook">
          <Flame className="h-4 w-4" aria-hidden="true" />
          {t('renderer.cookMinutes', { count: version.cookMinutes })}
        </span>
      ) : null}
      {scaledServings !== null ? (
        <span className="inline-flex items-center gap-1" data-testid="recipe-servings">
          <Utensils className="h-4 w-4" aria-hidden="true" />
          {t('renderer.servings', { count: scaledServings })}
        </span>
      ) : null}
    </div>
  );
}

function YieldLine({
  data,
  scaleFactor,
}: {
  data: RecipeVersionWithCompiledData;
  scaleFactor: number;
}) {
  const { t } = useTranslation('food');
  const label = buildYieldLabel({
    ingredient: data.yieldIngredient,
    variant: data.yieldVariant,
    prepState: data.yieldPrepState,
    qty: data.version.yieldQty,
    unit: data.version.yieldUnit,
    scaleFactor,
  });
  if (!label) return null;
  return (
    <p className="text-sm font-medium" data-testid="recipe-yield">
      {t('renderer.yieldLabel', { label })}
    </p>
  );
}

function TagsRow({ tags }: { tags: string[] }) {
  const { t } = useTranslation('food');
  return (
    <ul
      className="flex flex-wrap items-center gap-1"
      aria-label={t('renderer.tagsAria')}
      data-testid="recipe-tags"
    >
      {tags.map((tag) => (
        <li key={tag}>
          <Badge variant="outline">{tag}</Badge>
        </li>
      ))}
    </ul>
  );
}

// Re-exported for tests + downstream packages that need to format quantities
// the same way the header does.
export { formatQty };
