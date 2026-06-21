import type { SubstitutionScope } from '../../../food-api-shared-types.js';

export type SubstitutionEndpointKind = 'ingredient' | 'variant';

export interface SubstitutionEndpointInput {
  kind: SubstitutionEndpointKind;
  id: number;
}

export interface SubstitutionsFilterState {
  fromIngredientId: number | null;
  fromVariantId: number | null;
  toIngredientId: number | null;
  toVariantId: number | null;
  scope: SubstitutionScope | null;
  recipeId: number | null;
  contextTag: string;
}

export const EMPTY_FILTERS: SubstitutionsFilterState = {
  fromIngredientId: null,
  fromVariantId: null,
  toIngredientId: null,
  toVariantId: null,
  scope: null,
  recipeId: null,
  contextTag: '',
};

export interface CreateSubstitutionFormInput {
  from: SubstitutionEndpointInput;
  to: SubstitutionEndpointInput;
  ratio: number;
  scope: SubstitutionScope;
  recipeId: number | null;
  contextTags: readonly string[];
  notes: string | null;
}

export interface UpdateSubstitutionFormInput {
  id: number;
  ratio?: number;
  contextTags?: readonly string[];
}
