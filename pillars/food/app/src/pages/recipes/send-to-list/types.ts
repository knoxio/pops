/**
 * Local UI shapes for the send-to-list modal.
 *
 * The wire shapes come from the generated REST client (see
 * `./useSendToListData.ts`); this module exposes the form-state shape the
 * modal manages.
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
