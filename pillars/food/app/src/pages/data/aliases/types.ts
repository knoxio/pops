/**
 * Shared types for the Aliases tab on `/food/data/aliases`.
 *
 * These mirror the wire shapes exposed by the food pillar's aliases REST
 * contract. Keeping them in one place stops accidental drift across the
 * sub-files that compose the tab (toolbar, table, dialogs).
 */
export type AliasSource = 'user' | 'llm' | 'ingest';

export interface AliasIngredientTarget {
  readonly kind: 'ingredient';
  readonly id: number;
  readonly slug: string;
  readonly name: string;
}

export interface AliasVariantTarget {
  readonly kind: 'variant';
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly parentIngredientSlug: string;
  readonly parentIngredientName: string;
}

export type AliasTarget = AliasIngredientTarget | AliasVariantTarget;

export interface AliasRow {
  readonly id: number;
  readonly alias: string;
  readonly source: AliasSource;
  readonly createdAt: string;
  readonly target: AliasTarget;
}

export type AliasSortKey = 'alias' | 'target' | 'source' | 'createdAt';
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  readonly key: AliasSortKey;
  readonly direction: SortDirection;
}

/** Filter applied to the table; `null` source = no filter. */
export interface AliasesFilter {
  readonly source: AliasSource | null;
  readonly search: string;
}
