/**
 * Two-step picker for alias targets (PRD-122-C).
 *
 * Step 1 — type to search ingredients via `food.slugs.search`. Selecting
 * an ingredient hydrates the row via `food.ingredients.get` so the
 * embedded variants list is available without an extra round-trip.
 *
 * Step 2 — optionally pick a variant (chip below the ingredient row).
 * When no variant is picked the target is the ingredient itself.
 *
 * The component is a controlled input: the parent owns the `value`
 * (an `AliasTarget | null`) and reacts to `onChange`. Reset behaviour
 * is the parent's responsibility (e.g. on dialog close).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePillarQuery } from '@pops/pillar-sdk/react';
import { Button, Input } from '@pops/ui';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

import type { AliasTarget } from './types';

type SlugSearchOutput = inferRouterOutputs<AppRouter>['food']['slugs']['search'];
type IngredientsGetOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['get'];

export interface AliasTargetPickerProps {
  readonly value: AliasTarget | null;
  readonly onChange: (next: AliasTarget | null) => void;
  readonly inputId?: string;
}

export function AliasTargetPicker({ value, onChange, inputId }: AliasTargetPickerProps) {
  const { t } = useTranslation('food');
  const [query, setQuery] = useState('');
  const search = usePillarQuery<SlugSearchOutput>(
    'food',
    ['slugs', 'search'],
    { query, kinds: ['ingredient'], limit: 10 },
    { enabled: query.length > 0 }
  );

  const matches = search.data?.items ?? [];

  if (value !== null) {
    return (
      <SelectedTargetRow
        target={value}
        onClear={() => {
          onChange(null);
          setQuery('');
        }}
        onPickVariant={(target) => onChange(target)}
      />
    );
  }

  return (
    <div className="space-y-2">
      <Input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('data.aliases.picker.searchPlaceholder')}
        aria-label={t('data.aliases.picker.searchAriaLabel')}
      />
      {query.length > 0 && matches.length === 0 && !search.isLoading ? (
        <p className="text-muted-foreground text-sm">{t('data.aliases.picker.noResults')}</p>
      ) : null}
      <ul className="border-input divide-y divide-y-border max-h-48 overflow-y-auto rounded-md border">
        {matches.map((m) => (
          <li key={`${m.kind}-${m.targetId}`}>
            <button
              type="button"
              className="hover:bg-muted flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
              onClick={() =>
                onChange({
                  kind: 'ingredient',
                  id: m.targetId,
                  slug: m.slug,
                  name: m.name,
                })
              }
            >
              <span>{m.name}</span>
              <span className="text-muted-foreground font-mono text-xs">{m.slug}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SelectedTargetRowProps {
  readonly target: AliasTarget;
  readonly onClear: () => void;
  readonly onPickVariant: (next: AliasTarget) => void;
}

function SelectedTargetRow({ target, onClear, onPickVariant }: SelectedTargetRowProps) {
  const { t } = useTranslation('food');
  const ingredientId = target.kind === 'ingredient' ? target.id : null;
  const variants = usePillarQuery<IngredientsGetOutput>(
    'food',
    ['ingredients', 'get'],
    { idOrSlug: ingredientId ?? 0 },
    { enabled: ingredientId !== null }
  );
  return (
    <div className="space-y-2">
      <div className="border-input flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
        <span>
          <strong>
            {target.kind === 'ingredient' ? target.name : target.parentIngredientName}
          </strong>
          {target.kind === 'variant' ? <span> — {target.name}</span> : null}
        </span>
        <Button variant="ghost" size="sm" onClick={onClear}>
          {t('data.aliases.picker.clear')}
        </Button>
      </div>
      {target.kind === 'ingredient' && (variants.data?.variants ?? []).length > 0 ? (
        <VariantChips
          parent={target}
          variants={variants.data?.variants ?? []}
          onPick={(picked) => onPickVariant(picked)}
        />
      ) : null}
    </div>
  );
}

interface VariantChipsProps {
  readonly parent: { id: number; slug: string; name: string };
  readonly variants: ReadonlyArray<{ id: number; slug: string; name: string }>;
  readonly onPick: (target: AliasTarget) => void;
}

function VariantChips({ parent, variants, onPick }: VariantChipsProps) {
  const { t } = useTranslation('food');
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{t('data.aliases.picker.variantHint')}</p>
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => (
          <button
            key={v.id}
            type="button"
            className="bg-muted hover:bg-muted/80 rounded-full px-3 py-1 text-xs"
            onClick={() =>
              onPick({
                kind: 'variant',
                id: v.id,
                slug: v.slug,
                name: v.name,
                parentIngredientSlug: parent.slug,
                parentIngredientName: parent.name,
              })
            }
          >
            {v.name}
          </button>
        ))}
      </div>
    </div>
  );
}
