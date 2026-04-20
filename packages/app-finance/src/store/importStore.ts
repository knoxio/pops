import { create } from 'zustand';

import {
  buildNavigation,
  buildPendingChangeSetActions,
  buildPendingEntityActions,
  buildPendingTagRuleActions,
  buildSetters,
  buildTransactionActions,
} from './import-store-actions';
import { type ImportStore, initialState } from './import-store-types';

export type {
  AddPendingChangeSetInput,
  AddPendingEntityInput,
  AddPendingTagRuleChangeSetInput,
  BankType,
  ChangeSet,
  EntityType,
  ImportStore,
  PendingChangeSet,
  PendingEntity,
  PendingTagRuleChangeSet,
  ProcessedTransaction,
} from './import-store-types';

export const useImportStore = create<ImportStore>((set, get) => ({
  ...initialState,
  ...buildSetters(set),
  ...buildNavigation(set),
  ...buildPendingEntityActions(set, get),
  ...buildPendingChangeSetActions(set, get),
  ...buildPendingTagRuleActions(set, get),
  ...buildTransactionActions(set, get),
}));
