/**
 * DSL editor autocomplete — canonical unit list (PRD-120 part B).
 *
 * The DSL grammar (ADR-023 + PRD-114) allows any lowercase identifier
 * after `qty:`; the parser does not constrain unit names. PRD-116's
 * normaliser only knows `g`, `ml`, `count` natively, plus the alias
 * table populated by PRD-123. The suggestion list mirrors the built-in
 * units the editor knows about deterministically — anything else the
 * user types still parses; the suggestion list is a convenience, not a
 * gate. Add a constant here when PRD-123 promotes a new alias to first-
 * class status.
 *
 * Keep the ordering stable: canonical units first, then volume aliases,
 * then weight aliases, then time/temperature, then `none`. The dropdown
 * preserves the order we return so users see the most common units
 * first.
 */
export interface UnitSuggestion {
  slug: string;
  label: string;
}

export const DSL_UNIT_SUGGESTIONS: readonly UnitSuggestion[] = [
  { slug: 'g', label: 'grams' },
  { slug: 'ml', label: 'millilitres' },
  { slug: 'count', label: 'whole units' },
  { slug: 'cup', label: 'cups' },
  { slug: 'tbsp', label: 'tablespoons' },
  { slug: 'tsp', label: 'teaspoons' },
  { slug: 'oz', label: 'ounces' },
  { slug: 'lb', label: 'pounds' },
  { slug: 'min', label: 'minutes' },
  { slug: 's', label: 'seconds' },
  { slug: 'c', label: 'celsius' },
  { slug: 'f', label: 'fahrenheit' },
  { slug: 'none', label: 'unitless' },
];

/** The DSL function names the editor surfaces after a bare `@`. The
 *  insertion text omits the trailing `(` so the user keeps their typing
 *  momentum into the argument list. Keep the order matching PRD-120's
 *  Autocomplete table so the smoke tests stay deterministic. */
export interface FunctionSuggestion {
  slug: string;
  label: string;
}

export const DSL_FUNCTION_SUGGESTIONS: readonly FunctionSuggestion[] = [
  { slug: 'recipe', label: '@recipe(...)' },
  { slug: 'yield', label: '@yield(descriptor, qty:unit)' },
  { slug: 'ingredient', label: '@ingredient(N, descriptor, qty:unit)' },
  { slug: 'step', label: '@step("...")' },
  { slug: 'time', label: '@time(N:unit)' },
  { slug: 'temperature', label: '@temperature(N:unit)' },
];
