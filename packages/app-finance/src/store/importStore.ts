import { create } from "zustand";
import type {
  ParsedTransaction,
  ProcessedTransaction as BaseProcessedTransaction,
  ConfirmedTransaction,
  ImportResult,
  ImportWarning,
} from "@pops/finance-api/modules/imports";
import { findSimilarTransactions } from "../lib/transaction-utils";

export type BankType = "Amex";

/**
 * Extended ProcessedTransaction with frontend-only fields
 */
export interface ProcessedTransaction extends BaseProcessedTransaction {
  manuallyEdited?: boolean;
}

interface ImportStore {
  // Current wizard step (1-6)
  currentStep: number;

  // Step 1: Upload
  file: File | null;
  bankType: BankType;

  // Step 2: Column mapping
  headers: string[];
  rows: Record<string, string>[];
  columnMap: {
    date: string;
    description: string;
    amount: string;
    location?: string;
  };
  parsedTransactions: ParsedTransaction[];

  // Step 3: Processing
  processSessionId: string | null;

  // Step 4: Review (entity confirmation, no execute here)

  // Step 5: Tag Review
  executeSessionId: string | null;
  processedTransactions: {
    matched: ProcessedTransaction[]; // Uses extended type
    uncertain: ProcessedTransaction[];
    failed: ProcessedTransaction[];
    skipped: ProcessedTransaction[];
    warnings?: ImportWarning[];
  };
  confirmedTransactions: ConfirmedTransaction[];

  // Step 6: Summary
  importResult: {
    imported: number;
    failed: ImportResult[];
    skipped: number;
  } | null;

  // Actions
  setFile: (file: File | null) => void;
  setBankType: (bankType: BankType) => void;
  setHeaders: (headers: string[]) => void;
  setRows: (rows: Record<string, string>[]) => void;
  setColumnMap: (columnMap: ImportStore["columnMap"]) => void;
  setParsedTransactions: (parsed: ParsedTransaction[]) => void;
  setProcessSessionId: (sessionId: string | null) => void;
  setProcessedTransactions: (
    processed: ImportStore["processedTransactions"]
  ) => void;
  setConfirmedTransactions: (confirmed: ConfirmedTransaction[]) => void;
  setExecuteSessionId: (sessionId: string | null) => void;
  setImportResult: (result: ImportStore["importResult"]) => void;

  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  reset: () => void;

  // Transaction management
  updateTransaction: (
    transaction: ProcessedTransaction,
    updates: Partial<ProcessedTransaction>
  ) => void;
  findSimilar: (transaction: ProcessedTransaction) => ProcessedTransaction[];

  /** Update tags on a confirmed transaction by checksum (called from TagReviewStep). */
  updateTransactionTags: (checksum: string, tags: string[]) => void;
}

const initialState = {
  currentStep: 1,
  file: null,
  bankType: "Amex" as BankType,
  headers: [],
  rows: [],
  columnMap: {
    date: "",
    description: "",
    amount: "",
  },
  parsedTransactions: [],
  processSessionId: null,
  processedTransactions: {
    matched: [],
    uncertain: [],
    failed: [],
    skipped: [],
    warnings: undefined,
  },
  confirmedTransactions: [],
  executeSessionId: null,
  importResult: null,
};

export const useImportStore = create<ImportStore>((set) => ({
  ...initialState,

  setFile: (file) => set({ file }),
  setBankType: (bankType) => set({ bankType }),
  setHeaders: (headers) => set({ headers }),
  setRows: (rows) => set({ rows }),
  setColumnMap: (columnMap) => set({ columnMap }),
  setParsedTransactions: (parsedTransactions) => set({ parsedTransactions }),
  setProcessSessionId: (processSessionId) => set({ processSessionId }),
  setProcessedTransactions: (processedTransactions) =>
    set({ processedTransactions }),
  setConfirmedTransactions: (confirmedTransactions) =>
    set({ confirmedTransactions }),
  setExecuteSessionId: (executeSessionId) => set({ executeSessionId }),
  setImportResult: (importResult) => set({ importResult }),

  nextStep: () =>
    set((state) => ({ currentStep: Math.min(state.currentStep + 1, 6) })),
  prevStep: () =>
    set((state) => ({ currentStep: Math.max(state.currentStep - 1, 1) })),
  goToStep: (step) => set({ currentStep: step }),
  reset: () => set(initialState),

  updateTransaction: (transaction, updates) =>
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
    }),

  findSimilar: (transaction: ProcessedTransaction): ProcessedTransaction[] => {
    const state = useImportStore.getState();
    const allTransactions: ProcessedTransaction[] = [
      ...state.processedTransactions.uncertain,
      ...state.processedTransactions.failed,
    ];
    return findSimilarTransactions(transaction, allTransactions);
  },

  updateTransactionTags: (checksum, tags) =>
    set((state) => ({
      confirmedTransactions: state.confirmedTransactions.map((t) =>
        t.checksum === checksum ? { ...t, tags } : t
      ),
    })),
}));
