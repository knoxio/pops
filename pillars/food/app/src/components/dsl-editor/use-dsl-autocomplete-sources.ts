/**
 * `useDslAutocompleteSources` — production wiring for the autocomplete
 * extension.
 *
 * Builds three async lookups that the CodeMirror source calls per
 * keystroke:
 *
 *   - `searchSlugs(query, kinds)` → `slugsSearch` (GET /slugs/search)
 *   - `listVariantsForIngredient(slug)` → `ingredientsGet` (GET /ingredients/:idOrSlug)
 *   - `listPrepStates()` → `prepStatesList` (GET /prep-states)
 *
 * Each lookup goes straight through the generated Hey API SDK and reads
 * `result.data`. React Query is intentionally not involved here — the
 * CodeMirror source owns its own per-keystroke calls and the SDK client
 * is cheap to invoke.
 *
 * Tests do NOT import this hook — `DslEditor` accepts an
 * `autocompleteSources` prop and tests construct a synthetic object
 * implementing `DslAutocompleteSources` directly.
 */
import { useMemo } from 'react';

import { ingredientsGet, prepStatesList, slugsSearch } from '../../food-api/index.js';

import type {
  DslAutocompleteSources,
  PrepStateSuggestion,
  SlugKind,
  SlugSuggestion,
  VariantSuggestion,
} from './autocomplete-types';

export function useDslAutocompleteSources(): DslAutocompleteSources {
  return useMemo<DslAutocompleteSources>(
    () => ({
      // Every lookup swallows network / auth / server errors and resolves
      // to an empty list — throwing inside a CodeMirror CompletionSource
      // disables autocomplete for the session, which is the opposite of
      // what we want when a backend round-trip is flaky mid-keystroke.
      async searchSlugs(query, kinds) {
        try {
          const result = await slugsSearch({
            query: { query, kinds: kinds === undefined ? undefined : [...kinds] },
          });
          if (result.data === undefined) return [];
          return mapSlugs(result.data.items);
        } catch {
          return [];
        }
      },
      async listVariantsForIngredient(slug) {
        try {
          const result = await ingredientsGet({ path: { idOrSlug: slug } });
          if (result.data === undefined) return [];
          return mapVariants(result.data.variants);
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
          const result = await prepStatesList({});
          if (result.data === undefined) return [];
          return mapPrepStates(result.data.items);
        } catch {
          return [];
        }
      },
    }),
    []
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
