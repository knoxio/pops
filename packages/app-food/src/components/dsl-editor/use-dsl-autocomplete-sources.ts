/**
 * `useDslAutocompleteSources` — production wiring for the autocomplete
 * extension (PRD-120 part B).
 *
 * Builds three async lookups that the CodeMirror source calls per
 * keystroke:
 *
 *   - `searchSlugs(query, kinds)` → `food.slugs.search`
 *   - `listVariantsForIngredient(slug)` → `food.ingredients.get`
 *   - `listPrepStates()` → `food.prepStates.list`
 *
 * All three go through `trpc.useUtils().*.fetch`, which read-through
 * the React Query cache: repeated calls with the same input return the
 * cached payload instead of round-tripping. That's the PRD's
 * "Results are cached in React Query for the session" requirement.
 *
 * Tests do NOT import this hook — `DslEditor` accepts an
 * `autocompleteSources` prop and tests construct a synthetic object
 * implementing `DslAutocompleteSources` directly.
 */
import { useMemo, useRef } from 'react';

import { usePillarCall } from '../../lib/pillar-call.js';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

import type {
  DslAutocompleteSources,
  PrepStateSuggestion,
  SlugKind,
  SlugSuggestion,
  VariantSuggestion,
} from './autocomplete-types';

type SlugsSearchOutput = inferRouterOutputs<AppRouter>['food']['slugs']['search'];
type IngredientsGetOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['get'];
type PrepStatesListOutput = inferRouterOutputs<AppRouter>['food']['prepStates']['list'];

export function useDslAutocompleteSources(): DslAutocompleteSources {
  const call = usePillarCall();
  // Mirror the settings-page pattern: stash the callable in a ref so the
  // memo doesn't invalidate every render (call identity is not stable
  // across renders in production OR in tests).
  const callRef = useRef(call);
  callRef.current = call;

  return useMemo<DslAutocompleteSources>(
    () => ({
      // Every lookup swallows network / auth / server errors and resolves
      // to an empty list — throwing inside a CodeMirror CompletionSource
      // disables autocomplete for the session, which is the opposite of
      // what we want when a backend round-trip is flaky mid-keystroke.
      async searchSlugs(query, kinds) {
        try {
          const result = await callRef.current<SlugsSearchOutput>('food', ['slugs', 'search'], {
            query,
            kinds: kinds === undefined ? undefined : [...kinds],
          });
          if (result.kind !== 'ok') return [];
          return mapSlugs(result.value.items);
        } catch {
          return [];
        }
      },
      async listVariantsForIngredient(slug) {
        try {
          const result = await callRef.current<IngredientsGetOutput>(
            'food',
            ['ingredients', 'get'],
            { idOrSlug: slug }
          );
          if (result.kind !== 'ok') return [];
          return mapVariants(result.value.variants);
        } catch {
          // Missing ingredients are a normal autocomplete state (the
          // user typed a not-yet-created slug); never throw out of a
          // suggestion source — return an empty list and the popup
          // shows nothing for the variant slot.
          return [];
        }
      },
      async listPrepStates() {
        try {
          const result = await callRef.current<PrepStatesListOutput>(
            'food',
            ['prepStates', 'list'],
            undefined
          );
          if (result.kind !== 'ok') return [];
          return mapPrepStates(result.value.items);
        } catch {
          return [];
        }
      },
    }),
    [] // call accessed via ref; never invalidate
  );
}

interface RawSlug {
  slug: string;
  kind: SlugKind;
  name: string;
}

function mapSlugs(items: readonly RawSlug[]): readonly SlugSuggestion[] {
  return items.map((item) => ({ slug: item.slug, kind: item.kind, name: item.name }));
}

interface RawVariant {
  slug: string;
  name: string;
}

function mapVariants(items: readonly RawVariant[]): readonly VariantSuggestion[] {
  return items.map((item) => ({ slug: item.slug, name: item.name }));
}

interface RawPrepState {
  slug: string;
  name: string;
}

function mapPrepStates(items: readonly RawPrepState[]): readonly PrepStateSuggestion[] {
  return items.map((item) => ({ slug: item.slug, name: item.name }));
}
