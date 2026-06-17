/** Wire-derived ingredient row shapes, projected from the ingredients REST surface. */
import type {
  IngredientsBlockersResponses,
  IngredientsGetResponses,
  IngredientsListResponses,
} from '../../../food-api/types.gen.js';

export type IngredientRow = IngredientsListResponses[200]['items'][number];
export type IngredientVariantRow = IngredientsGetResponses[200]['variants'][number];
export type DeleteBlockerSummary = IngredientsBlockersResponses[200]['data'];
