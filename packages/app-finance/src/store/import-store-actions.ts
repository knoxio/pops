import { findSimilarTransactions } from '../lib/transaction-utils';
import {
  type AddPendingChangeSetInput,
  type AddPendingEntityInput,
  type AddPendingTagRuleChangeSetInput,
  downstreamReset,
  fingerprintParsedTransactions,
  type ImportStore,
  initialState,
  isSameFile,
  type PendingChangeSet,
  type PendingEntity,
  type PendingTagRuleChangeSet,
  type ProcessedTransaction,
} from './import-store-types';

type StoreSet = (
  partial: Partial<ImportStore> | ((state: ImportStore) => Partial<ImportStore>)
) => void;
type StoreGet = () => ImportStore;

export function buildSetters(set: StoreSet) {
  return {
    setFile: (file: File | null) =>
      set((state) => (isSameFile(state.file, file) ? { file } : { ...downstreamReset, file })),
    setBankType: (bankType: ImportStore['bankType']) => set({ bankType }),
    setHeaders: (headers: string[]) => set({ headers }),
    setRows: (rows: Record<string, string>[]) => set({ rows }),
    setColumnMap: (columnMap: ImportStore['columnMap']) => set({ columnMap }),
    setParsedTransactions: (parsedTransactions: ImportStore['parsedTransactions']) =>
      set((state) => {
        const nextFingerprint = fingerprintParsedTransactions(parsedTransactions);
        if (nextFingerprint === state.parsedTransactionsFingerprint) {
          return { parsedTransactions };
        }
        return {
          ...downstreamReset,
          parsedTransactions,
          parsedTransactionsFingerprint: nextFingerprint,
        };
      }),
    setProcessSessionId: (processSessionId: string | null) => set({ processSessionId }),
    setProcessedTransactions: (processedTransactions: ImportStore['processedTransactions']) =>
      set((state) => ({
        processedTransactions,
        processedForFingerprint: state.parsedTransactionsFingerprint,
      })),
    setConfirmedTransactions: (confirmedTransactions: ImportStore['confirmedTransactions']) =>
      set({ confirmedTransactions }),
    setCommitResult: (commitResult: ImportStore['commitResult']) => set({ commitResult }),
  };
}

export function buildNavigation(set: StoreSet) {
  return {
    nextStep: () => set((state) => ({ currentStep: Math.min(state.currentStep + 1, 7) })),
    prevStep: () => set((state) => ({ currentStep: Math.max(state.currentStep - 1, 1) })),
    goToStep: (step: number) => set({ currentStep: step }),
    reset: () => set(initialState),
  };
}

export function buildPendingEntityActions(set: StoreSet, get: StoreGet) {
  return {
    addPendingEntity: (
      input: AddPendingEntityInput,
      dbEntities: Array<{ name: string }> = []
    ): PendingEntity => {
      const nameLower = input.name.toLowerCase();
      const state = get();
      if (state.pendingEntities.some((e) => e.name.toLowerCase() === nameLower)) {
        throw new Error(`Entity with name "${input.name}" already exists in pending list`);
      }
      if (dbEntities.some((e) => e.name.toLowerCase() === nameLower)) {
        throw new Error(`Entity with name "${input.name}" already exists in the database`);
      }
      const entity: PendingEntity = {
        tempId: `temp:entity:${globalThis.crypto.randomUUID()}`,
        name: input.name,
        type: input.type,
      };
      set((prev) => ({ pendingEntities: [...prev.pendingEntities, entity] }));
      return entity;
    },
    listPendingEntities: (): PendingEntity[] => get().pendingEntities,
    removePendingEntity: (tempId: string) =>
      set((state) => ({
        pendingEntities: state.pendingEntities.filter((e) => e.tempId !== tempId),
      })),
  };
}

export function buildPendingChangeSetActions(set: StoreSet, get: StoreGet) {
  return {
    addPendingChangeSet: (input: AddPendingChangeSetInput): PendingChangeSet => {
      const entry: PendingChangeSet = {
        tempId: `temp:changeset:${globalThis.crypto.randomUUID()}`,
        changeSet: input.changeSet,
        appliedAt: new Date().toISOString(),
        source: input.source,
      };
      set((prev) => ({ pendingChangeSets: [...prev.pendingChangeSets, entry] }));
      return entry;
    },
    listPendingChangeSets: (): PendingChangeSet[] => get().pendingChangeSets,
    removePendingChangeSet: (tempId: string) =>
      set((state) => ({
        pendingChangeSets: state.pendingChangeSets.filter((c) => c.tempId !== tempId),
      })),
  };
}

export function buildPendingTagRuleActions(set: StoreSet, get: StoreGet) {
  return {
    addPendingTagRuleChangeSet: (
      input: AddPendingTagRuleChangeSetInput
    ): PendingTagRuleChangeSet => {
      const entry: PendingTagRuleChangeSet = {
        tempId: `temp:tagrules:${crypto.randomUUID()}`,
        changeSet: input.changeSet,
        appliedAt: new Date().toISOString(),
        source: input.source,
      };
      set((prev) => ({ pendingTagRuleChangeSets: [...prev.pendingTagRuleChangeSets, entry] }));
      return entry;
    },
    listPendingTagRuleChangeSets: (): PendingTagRuleChangeSet[] => get().pendingTagRuleChangeSets,
    removePendingTagRuleChangeSet: (tempId: string) =>
      set((state) => ({
        pendingTagRuleChangeSets: state.pendingTagRuleChangeSets.filter((c) => c.tempId !== tempId),
      })),
  };
}

export function buildTransactionActions(set: StoreSet, get: StoreGet) {
  return {
    updateTransaction: (
      transaction: ProcessedTransaction,
      updates: Partial<ProcessedTransaction>
    ) => {
      set((state) => {
        const updateInArray = (arr: ProcessedTransaction[]) =>
          arr.map((t) => (t === transaction ? { ...t, ...updates } : t));
        return {
          processedTransactions: {
            ...state.processedTransactions,
            matched: updateInArray(state.processedTransactions.matched),
            uncertain: updateInArray(state.processedTransactions.uncertain),
            failed: updateInArray(state.processedTransactions.failed),
            skipped: updateInArray(state.processedTransactions.skipped),
          },
        };
      });
    },
    findSimilar: (transaction: ProcessedTransaction): ProcessedTransaction[] => {
      const state = get();
      const allTransactions: ProcessedTransaction[] = [
        ...state.processedTransactions.uncertain,
        ...state.processedTransactions.failed,
      ];
      return findSimilarTransactions(transaction, allTransactions);
    },
    updateTransactionTags: (checksum: string, tags: string[]) => {
      set((state) => ({
        confirmedTransactions: state.confirmedTransactions.map((t) =>
          t.checksum === checksum ? { ...t, tags } : t
        ),
      }));
    },
  };
}
