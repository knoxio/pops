/**
 * PRD-135 — renderer tab body.
 *
 * Lazy-fetches PRD-121's `RecipeVersionWithCompiledData` via
 * `food.recipes.getForRendering` and mounts the read-only renderer. When
 * `compileStatus !== 'compiled'` we show a stub instead — the renderer is
 * only meaningful against materialised lines + steps.
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { usePillarQuery } from '@pops/pillar-sdk/react';

import { RecipeRenderer } from '../../../components/RecipeRenderer.js';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

type GetForRenderingOutput = inferRouterOutputs<AppRouter>['food']['recipes']['getForRendering'];

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
  const query = usePillarQuery<GetForRenderingOutput>('food', ['recipes', 'getForRendering'], {
    slug,
    versionNo,
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
