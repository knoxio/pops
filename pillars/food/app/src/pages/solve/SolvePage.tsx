/**
 * `/food/solve` — see pillars/food/docs/prds/cook-solver.
 *
 * Discovery surface: walks every compiled, non-archived recipe against
 * the current pantry + substitution graph and lists the cookable
 * subset, ranked by `subsNeeded ASC, lastCookedAt DESC NULLS LAST,
 * slug ASC`. Click "Cook this" jumps to `/food/recipes/:slug` — the
 * regular cook flow takes over.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

import { SolveFilters } from './SolveFilters.js';
import { SolveRecipeCard } from './SolveRecipeCard.js';
import { DEFAULT_SOLVE_FILTERS, useSolveResult, type SolveFilterState } from './useSolveResult.js';

import type { ReactElement } from 'react';

export function SolvePage(): ReactElement {
  const { t } = useTranslation('food');
  const [filters, setFilters] = useState<SolveFilterState>({ ...DEFAULT_SOLVE_FILTERS });
  const { data, isLoading, error } = useSolveResult({ filters });

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{t('solve.title')}</h1>
      </header>
      <SolveFilters filters={filters} onChange={setFilters} />
      <SolveBody
        data={data}
        isLoading={isLoading}
        error={error}
        filters={filters}
        onResetFilters={() => setFilters({ ...DEFAULT_SOLVE_FILTERS })}
      />
    </div>
  );
}

interface BodyProps {
  data: ReturnType<typeof useSolveResult>['data'];
  isLoading: boolean;
  error: Error | null;
  filters: SolveFilterState;
  onResetFilters: () => void;
}

function SolveBody({ data, isLoading, error, filters, onResetFilters }: BodyProps): ReactElement {
  const { t } = useTranslation('food');
  if (error !== null) {
    return (
      <p
        role="alert"
        className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm"
      >
        {t('solve.error', { message: error.message })}
      </p>
    );
  }
  if (isLoading || data === undefined) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('solve.loading')}
      </p>
    );
  }
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {t('solve.countCaption', {
          cookable: data.cookableCount,
          total: data.totalCandidates,
        })}
      </p>
      {data.recipes.length === 0 ? (
        <EmptyState filters={filters} onResetFilters={onResetFilters} />
      ) : (
        <ul className="space-y-3">
          {data.recipes.map((recipe) => (
            <li key={recipe.recipeId}>
              <SolveRecipeCard recipe={recipe} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

interface EmptyStateProps {
  filters: SolveFilterState;
  onResetFilters: () => void;
}

function EmptyState({ filters, onResetFilters }: EmptyStateProps): ReactElement {
  const { t } = useTranslation('food');
  const hasFilters = hasAnyFilter(filters);
  return (
    <div className="rounded-md border border-dashed p-10 text-center">
      <p className="text-sm">{hasFilters ? t('solve.empty.filtered') : t('solve.empty.bare')}</p>
      <div className="mt-3 flex items-center justify-center gap-2">
        {hasFilters && (
          <Button size="sm" variant="outline" onClick={onResetFilters}>
            {t('solve.empty.clearFilters')}
          </Button>
        )}
        {!hasFilters && (
          <Button size="sm" variant="outline" asChild>
            <Link to="/food/fridge">{t('solve.empty.openFridge')}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function hasAnyFilter(filters: SolveFilterState): boolean {
  if (filters.excludeSubs) return true;
  if (filters.recipeTypes.length > 0) return true;
  if (filters.tags.length > 0) return true;
  if (filters.maxMinutes !== null) return true;
  return false;
}
