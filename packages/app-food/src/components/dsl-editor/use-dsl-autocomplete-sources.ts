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

import { trpc } from '@pops/api-client';

import type {
  DslAutocompleteSources,
  PrepStateSuggestion,
  SlugKind,
  SlugSuggestion,
  VariantSuggestion,
} from './autocomplete-types';

export function useDslAutocompleteSources(): DslAutocompleteSources {
  const utils = trpc.useUtils();
  // Mirror the settings-page pattern: stash utils in a ref so the memo
  // doesn't invalidate every render (the trpc utils identity is not
  // stable across renders in production OR in tests).
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  return useMemo<DslAutocompleteSources>(
    () => ({
      async searchSlugs(query, kinds) {
        const result = await utilsRef.current.food.slugs.search.fetch({
          query,
          kinds: kinds === undefined ? undefined : [...kinds],
        });
        return mapSlugs(result.items);
      },
      async listVariantsForIngredient(slug) {
        try {
          const result = await utilsRef.current.food.ingredients.get.fetch({ idOrSlug: slug });
          return mapVariants(result.variants);
        } catch {
          // Missing ingredients are a normal autocomplete state (the
          // user typed a not-yet-created slug); never throw out of a
          // suggestion source — return an empty list and the popup
          // shows nothing for the variant slot.
          return [];
        }
      },
      async listPrepStates() {
        const result = await utilsRef.current.food.prepStates.list.fetch();
        return mapPrepStates(result.items);
      },
    }),
    [] // utils accessed via ref; never invalidate
  );
}

interface RawSlug {
  slug: string;
  kind: string;
  name: string;
}

function mapSlugs(items: readonly RawSlug[]): readonly SlugSuggestion[] {
  return items.map((item) => ({
    slug: item.slug,
    kind: item.kind as SlugKind,
    name: item.name,
  }));
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
