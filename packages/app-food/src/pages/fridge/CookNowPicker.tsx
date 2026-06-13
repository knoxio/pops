/**
 * "Cook now" picker — PRD-147.
 *
 * Lists recipes whose current version references this batch's variant.
 * The match is variant-only (not prep-aware) — a prep-aware solver
 * arrives in Epic 06. Clicking a recipe navigates to its detail page;
 * the cook flow takes over there.
 */
import { type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { usePillarQuery } from '@pops/pillar-sdk/react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@pops/ui';

import { formatQty } from './format.js';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';
import type { BatchUnit, RecipeForCookRow } from '@pops/app-food-db';

type RecipesUsingBatchOutput = inferRouterOutputs<AppRouter>['food']['fridge']['recipesUsingBatch'];

export interface CookNowPickerProps {
  batchId: number | null;
  batchUnit: BatchUnit | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CookNowPicker({
  batchId,
  batchUnit,
  isOpen,
  onClose,
}: CookNowPickerProps): ReactElement {
  const navigate = useNavigate();
  const result = usePillarQuery<RecipesUsingBatchOutput>(
    'food',
    ['fridge', 'recipesUsingBatch'],
    { batchId: batchId ?? 0 },
    { enabled: isOpen && batchId !== null }
  );

  const items = result.data?.items ?? [];

  function handleNavigate(slug: string): void {
    onClose();
    void navigate(`/food/recipes/${slug}`);
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>What can you cook with this batch?</DialogTitle>
        </DialogHeader>
        <PickerBody
          isLoading={result.isLoading}
          error={result.error instanceof Error ? result.error : null}
          items={items}
          batchUnit={batchUnit}
          onPick={handleNavigate}
        />
        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PickerBodyProps {
  isLoading: boolean;
  error: Error | null;
  items: readonly RecipeForCookRow[];
  batchUnit: BatchUnit | null;
  onPick: (slug: string) => void;
}

function PickerBody({ isLoading, error, items, batchUnit, onPick }: PickerBodyProps): ReactElement {
  if (error !== null) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn&apos;t load matching recipes: {error.message}
      </p>
    );
  }
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No recipes use this batch&apos;s ingredient yet.{' '}
        <Link className="underline" to="/food/recipes/new">
          Try creating one!
        </Link>
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {items.map((row) => (
        <RecipeRow key={row.recipeId} row={row} batchUnit={batchUnit} onPick={onPick} />
      ))}
    </ul>
  );
}

interface RecipeRowProps {
  row: RecipeForCookRow;
  batchUnit: BatchUnit | null;
  onPick: (slug: string) => void;
}

function RecipeRow({ row, batchUnit, onPick }: RecipeRowProps): ReactElement {
  const needs = describeNeeds(row.recipeNeedsQty, batchUnit);
  return (
    <li>
      <button
        type="button"
        className="block w-full rounded px-3 py-2 text-left hover:bg-accent"
        onClick={() => onPick(row.recipeSlug)}
      >
        <div className="font-medium">{row.title}</div>
        <div className="text-xs text-muted-foreground">
          {needs}
          {row.lastCookedAt !== null && <> · last cooked {row.lastCookedAt.slice(0, 10)}</>}
        </div>
      </button>
    </li>
  );
}

function describeNeeds(qty: number | null, unit: BatchUnit | null): string {
  if (qty === null || unit === null) return 'Needs ~?';
  return `Needs ~${formatQty(qty, unit)}`;
}
