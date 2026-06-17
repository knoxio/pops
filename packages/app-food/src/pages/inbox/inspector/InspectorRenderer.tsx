/**
 * PRD-135 — renderer tab body.
 *
 * Lazy-fetches PRD-121's `RecipeVersionWithCompiledData` via
 * `food.recipes.getForRendering` and mounts the read-only renderer. When
 * `compileStatus !== 'compiled'` we show a stub instead — the renderer is
 * only meaningful against materialised lines + steps.
 */
import { useQuery } from '@tanstack/react-query';
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { unwrap } from '../../../food-api-helpers.js';
import { recipesGetForRendering } from '../../../food-api/index.js';
import { RecipeRenderer } from '../../../components/RecipeRenderer.js';

import type { RecipeVersionWithCompiledData } from '@pops/app-food-db';

interface Props {
  slug: string;
  versionNo: number;
  compileStatus: 'uncompiled' | 'compiled' | 'failed';
}

export function InspectorRenderer({ slug, versionNo, compileStatus }: Props): ReactElement {
  const { t } = useTranslation('food');
  if (compileStatus !== 'compiled') {
    return (
      <div className="rounded-md border bg-muted p-4 text-sm" data-testid="inspector-renderer-stub">
        {t('inbox.inspector.renderer.unavailable')}
      </div>
    );
  }
  return <RendererBody slug={slug} versionNo={versionNo} t={t} />;
}

interface BodyProps {
  slug: string;
  versionNo: number;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

function RendererBody({ slug, versionNo, t }: BodyProps): ReactElement {
  const query = useQuery({
    queryKey: ['food', 'recipes', 'getForRendering', { slug, versionNo }],
    queryFn: async (): Promise<RecipeVersionWithCompiledData> =>
      // The renderer endpoint serves the joined payload as an opaque blob
      // (`unknown` in the generated SDK); narrow it from `unknown` to the
      // renderer's view type — a single narrowing assertion.
      unwrap(await recipesGetForRendering({ path: { slug }, query: { versionNo } })) as RecipeVersionWithCompiledData,
  });
  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">{t('inbox.inspector.renderer.loading')}</p>;
  }
  if (query.isError || query.data === undefined) {
    return (
      <p className="text-sm text-destructive" data-testid="inspector-renderer-error">
        {t('inbox.inspector.renderer.error', { message: query.error?.message ?? '' })}
      </p>
    );
  }
  return <RecipeRenderer recipeVersion={query.data} scaleFactor={1} variant="detail" />;
}
