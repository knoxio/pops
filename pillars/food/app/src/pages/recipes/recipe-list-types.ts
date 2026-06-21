export const RECIPE_TYPES = [
  'plate',
  'component',
  'technique',
  'sauce',
  'dressing',
  'drink',
  'condiment',
] as const;

export type RecipeType = (typeof RECIPE_TYPES)[number];

export const SORT_OPTIONS = ['createdAtDesc', 'titleAsc', 'recentlyCooked'] as const;
export type SortOrder = (typeof SORT_OPTIONS)[number];

export interface RecipeListFilterState {
  search: string;
  recipeTypes: RecipeType[];
  tags: string[];
  includeArchived: boolean;
  includeDraftOnly: boolean;
  sort: SortOrder;
}

export const DEFAULT_FILTERS: RecipeListFilterState = {
  search: '',
  recipeTypes: [],
  tags: [],
  includeArchived: false,
  includeDraftOnly: false,
  sort: 'createdAtDesc',
};
