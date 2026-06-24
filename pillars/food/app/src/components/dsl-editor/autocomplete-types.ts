/**
 * DSL editor autocomplete — public type surface.
 *
 * The CodeMirror sources are pure: they call a small set of async lookups
 * to fetch suggestions. `useDslAutocompleteSources()` builds production
 * lookups against the food REST API; tests inject deterministic stubs
 * implementing the same shape. Keeping the contract narrow (three async
 * methods) lets a parent mount the editor without exposing every food
 * endpoint to it.
 */
export type SlugKind = 'ingredient' | 'recipe' | 'prep_state';

export interface SlugSuggestion {
  /** The bare slug as it should be inserted at the cursor. */
  slug: string;
  /** Slug kind so the dropdown can group / icon them later. */
  kind: SlugKind;
  /** Display name (resolved from the target row). May be empty. */
  name: string;
}

export interface VariantSuggestion {
  /** Variant slug (insertion text). */
  slug: string;
  /** Display name for the popup. */
  name: string;
}

export interface PrepStateSuggestion {
  /** Prep-state slug (insertion text). */
  slug: string;
  /** Display name for the popup. */
  name: string;
}

/**
 * Lookups the autocomplete extension calls. Implementations cache as they
 * see fit; the extension does not memoise on its own.
 */
export interface DslAutocompleteSources {
  searchSlugs: (query: string, kinds?: readonly SlugKind[]) => Promise<readonly SlugSuggestion[]>;
  listVariantsForIngredient: (ingredientSlug: string) => Promise<readonly VariantSuggestion[]>;
  listPrepStates: () => Promise<readonly PrepStateSuggestion[]>;
}
