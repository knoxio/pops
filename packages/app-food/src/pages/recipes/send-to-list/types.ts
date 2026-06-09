/**
 * Local UI shapes for the send-to-list modal — PRD-142.
 *
 * The wire-shape `SendPreview` is inferred from `food.recipes.prepareSendToList`
 * via tRPC; this module exposes the form-state shape the modal manages.
 */
export type TargetKind = 'existing' | 'new';

export interface FormState {
  kind: TargetKind;
  listId: number | null;
  newName: string;
}

export type SendError =
  | 'RecipeNotFound'
  | 'NoIngredients'
  | 'TargetListNotFound'
  | 'TargetListArchived'
  | 'TargetListNotShopping'
  | 'NameRequiredForNew'
  | 'CompileNotReady'
  | 'Unknown';
