import { create } from 'zustand';

import { findSimilarTransactions } from '../lib/transaction-utils';

import type { ChangeSet } from '@pops/api/modules/core/corrections/types';
import type { TagRuleChangeSet } from '@pops/api/modules/core/tag-rules/types';
import type {
  ConfirmedTransaction,
  ImportWarning,
  ParsedTransaction,
  ProcessedTransaction as BaseProcessedTransaction,
} from '@pops/api/modules/finance/imports';
import type { CommitResult } from '@pops/api/modules/finance/imports';

export type BankType = 'Amex';
export type { ChangeSet };

export type EntityType = 'company' | 'person' | 'government' | 'bank';

// ---------------------------------------------------------------------------
// Pending entity — created during import, stored locally until Step 6 commit.
// ---------------------------------------------------------------------------

export interface PendingEntity {
  tempId: string; // Format: temp:entity:{uuid}
  name: string;
  type: EntityType;
}

/** Input for creating a pending entity (tempId is generated internally). */
export interface AddPendingEntityInput {
  name: string;
  type: EntityType;
}

// ---------------------------------------------------------------------------
// Pending changeset — rule ChangeSet approved during import, not yet committed.
// ---------------------------------------------------------------------------

export interface PendingChangeSet {
  tempId: string; // Format: temp:changeset:{uuid}
  changeSet: ChangeSet;
  appliedAt: string; // ISO-8601
  source: string;
}

/** Input for creating a pending changeset (tempId and appliedAt are generated internally). */
export interface AddPendingChangeSetInput {
  changeSet: ChangeSet;
  source: string;
}

// ---------------------------------------------------------------------------
// Pending tag-rule ChangeSet — PRD-029 (bundled with import commit)
// ---------------------------------------------------------------------------

export interface PendingTagRuleChangeSet {
  tempId: string; // Format: temp:tagrules:{uuid}
  changeSet: TagRuleChangeSet;
  appliedAt: string; // ISO-8601
  source: string;
}

export interface AddPendingTagRuleChangeSetInput {
  changeSet: TagRuleChangeSet;
  source: string;
}

/**
 * Extended ProcessedTransaction with frontend-only fields
 */
export interface ProcessedTransaction extends BaseProcessedTransaction {
  manuallyEdited?: boolean;
}

interface ImportStore {
  // Current wizard step (1-7)
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
  /**
   * Content fingerprint of the current `parsedTransactions` list — a
   * concatenation of their `checksum` fields. Rebuilt inside
   * `setParsedTransactions` and compared against `processedForFingerprint`
   * so the Step 3 "already processed" short-circuit cannot fire with a
   * processed-transactions set that was computed from a *different* parse
   * of the CSV (e.g. after the user went back to Step 2 and re-mapped
   * columns).
   */
  parsedTransactionsFingerprint: string;

  // Step 3: Processing
  processSessionId: string | null;
  /**
   * The `parsedTransactionsFingerprint` value that the current
   * `processedTransactions` were derived from. `null` until the first
   * successful processing run, or after any reset. Compared in
   * `ProcessingStep` to decide whether cached results are still valid.
   */
  processedForFingerprint: string | null;

  // Step 4: Review (entity confirmation, no execute here)

  // Step 5: Tag Review
  processedTransactions: {
    matched: ProcessedTransaction[]; // Uses extended type
    uncertain: ProcessedTransaction[];
    failed: ProcessedTransaction[];
    skipped: ProcessedTransaction[];
    warnings?: ImportWarning[];
  };
  confirmedTransactions: ConfirmedTransaction[];

  // Step 6 commit / Step 7 summary
  commitResult: CommitResult | null;

  // Local-first pending state (PRD-030)
  pendingEntities: PendingEntity[];
  pendingChangeSets: PendingChangeSet[];
  pendingTagRuleChangeSets: PendingTagRuleChangeSet[];

  // Actions
  setFile: (file: File | null) => void;
  setBankType: (bankType: BankType) => void;
  setHeaders: (headers: string[]) => void;
  setRows: (rows: Record<string, string>[]) => void;
  setColumnMap: (columnMap: ImportStore['columnMap']) => void;
  setParsedTransactions: (parsed: ParsedTransaction[]) => void;
  setProcessSessionId: (sessionId: string | null) => void;
  setProcessedTransactions: (processed: ImportStore['processedTransactions']) => void;
  setConfirmedTransactions: (confirmed: ConfirmedTransaction[]) => void;
  setCommitResult: (result: CommitResult | null) => void;

  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  reset: () => void;

  // Pending entity management (PRD-030 US-01)
  addPendingEntity: (
    input: AddPendingEntityInput,
    dbEntities?: Array<{ name: string }>
  ) => PendingEntity;
  listPendingEntities: () => PendingEntity[];
  removePendingEntity: (tempId: string) => void;

  // Pending changeset management (PRD-030 US-02)
  addPendingChangeSet: (input: AddPendingChangeSetInput) => PendingChangeSet;
  listPendingChangeSets: () => PendingChangeSet[];
  removePendingChangeSet: (tempId: string) => void;

  // Pending tag-rule ChangeSets (PRD-029)
  addPendingTagRuleChangeSet: (input: AddPendingTagRuleChangeSetInput) => PendingTagRuleChangeSet;
  listPendingTagRuleChangeSets: () => PendingTagRuleChangeSet[];
  removePendingTagRuleChangeSet: (tempId: string) => void;

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
  bankType: 'Amex' as BankType,
  headers: [],
  rows: [],
  columnMap: {
    date: '',
    description: '',
    amount: '',
  },
  parsedTransactions: [],
  parsedTransactionsFingerprint: '',
  processSessionId: null,
  processedForFingerprint: null,
  processedTransactions: {
    matched: [],
    uncertain: [],
    failed: [],
    skipped: [],
    warnings: undefined,
  },
  confirmedTransactions: [],
  commitResult: null,
  pendingEntities: [],
  pendingChangeSets: [],
  pendingTagRuleChangeSets: [],
};

/**
 * Produce a content fingerprint for a list of parsed transactions. Uses the
 * `checksum` fields (SHA-256 of each raw row) joined with a separator —
 * cheap to compute, deterministic, and changes whenever either the rows
 * themselves or their order change. Empty list → empty string.
 */
function fingerprintParsedTransactions(txns: ParsedTransaction[]): string {
  if (txns.length === 0) return '';
  return txns.map((t) => t.checksum).join('|');
}

/**
 * Shape returned when the user starts a brand-new import (new file selected).
 * Resets every wizard-step result that was computed from the *previous* file,
 * so Step 3 doesn't short-circuit with "Already processed" using stale data.
 * We intentionally keep `currentStep` and `columnMap` untouched — the user is
 * still inside the wizard, and re-using their column mapping is a nicety.
 */
const downstreamReset: Pick<
  ImportStore,
  | 'headers'
  | 'rows'
  | 'parsedTransactions'
  | 'parsedTransactionsFingerprint'
  | 'processSessionId'
  | 'processedForFingerprint'
  | 'processedTransactions'
  | 'confirmedTransactions'
  | 'commitResult'
  | 'pendingEntities'
  | 'pendingChangeSets'
  | 'pendingTagRuleChangeSets'
> = {
  headers: initialState.headers,
  rows: initialState.rows,
  parsedTransactions: initialState.parsedTransactions,
  parsedTransactionsFingerprint: initialState.parsedTransactionsFingerprint,
  processSessionId: initialState.processSessionId,
  processedForFingerprint: initialState.processedForFingerprint,
  processedTransactions: initialState.processedTransactions,
  confirmedTransactions: initialState.confirmedTransactions,
  commitResult: initialState.commitResult,
  pendingEntities: initialState.pendingEntities,
  pendingChangeSets: initialState.pendingChangeSets,
  pendingTagRuleChangeSets: initialState.pendingTagRuleChangeSets,
};

function isSameFile(a: File | null, b: File | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

export const useImportStore = create<ImportStore>((set) => ({
  ...initialState,

  setFile: (file) => {
    set((state) => {
      // Selecting a different file means the previous parse/process/review
      // results belong to a stale input. Wipe them so Step 3 doesn't reuse
      // prior `processedTransactions` and render "Already processed".
      if (!isSameFile(state.file, file)) {
        return { ...downstreamReset, file };
      }
      return { file };
    });
  },
  setBankType: (bankType) => {
    set({ bankType });
  },
  setHeaders: (headers) => {
    set({ headers });
  },
  setRows: (rows) => {
    set({ rows });
  },
  setColumnMap: (columnMap) => {
    set({ columnMap });
  },
  setParsedTransactions: (parsedTransactions) => {
    set((state) => {
      const nextFingerprint = fingerprintParsedTransactions(parsedTransactions);
      // If the parsed input is byte-for-byte identical to what's already in
      // the store (e.g. the user bounced back to Step 2 and hit Continue
      // without touching the column mapping), keep downstream processing
      // state intact so Step 3 can short-circuit legitimately.
      if (nextFingerprint === state.parsedTransactionsFingerprint) {
        return { parsedTransactions };
      }
      // Input has actually changed — downstream caches are stale and must
      // be invalidated. We also clear `processedForFingerprint` explicitly
      // (belt-and-suspenders: it's covered by downstreamReset, but being
      // explicit here makes the invariant easier to audit).
      return {
        ...downstreamReset,
        parsedTransactions,
        parsedTransactionsFingerprint: nextFingerprint,
      };
    });
  },
  setProcessSessionId: (processSessionId) => {
    set({ processSessionId });
  },
  setProcessedTransactions: (processedTransactions) => {
    set((state) => ({
      processedTransactions,
      // Pin the processed results to the fingerprint of the parsed input
      // they were computed from. ProcessingStep compares this against the
      // live `parsedTransactionsFingerprint` to decide whether a Back→
      // Continue cycle can skip re-processing.
      processedForFingerprint: state.parsedTransactionsFingerprint,
    }));
  },
  setConfirmedTransactions: (confirmedTransactions) => {
    set({ confirmedTransactions });
  },
  setCommitResult: (commitResult) => {
    set({ commitResult });
  },

  nextStep: () => {
    set((state) => ({ currentStep: Math.min(state.currentStep + 1, 7) }));
  },
  prevStep: () => {
    set((state) => ({ currentStep: Math.max(state.currentStep - 1, 1) }));
  },
  goToStep: (step) => {
    set({ currentStep: step });
  },
  reset: () => {
    set(initialState);
  },

  // Pending entity management (PRD-030 US-01)
  addPendingEntity: (
    input: AddPendingEntityInput,
    dbEntities: Array<{ name: string }> = []
  ): PendingEntity => {
    const nameLower = input.name.toLowerCase();

    // Check uniqueness against pending list
    const state = useImportStore.getState();
    if (state.pendingEntities.some((e: PendingEntity) => e.name.toLowerCase() === nameLower)) {
      throw new Error(`Entity with name "${input.name}" already exists in pending list`);
    }

    // Check uniqueness against DB entity list
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
  listPendingEntities: (): PendingEntity[] => useImportStore.getState().pendingEntities,
  removePendingEntity: (tempId: string) => {
    set((state) => ({
      pendingEntities: state.pendingEntities.filter((e: PendingEntity) => e.tempId !== tempId),
    }));
  },

  // Pending changeset management (PRD-030 US-02)
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
  listPendingChangeSets: (): PendingChangeSet[] => useImportStore.getState().pendingChangeSets,
  removePendingChangeSet: (tempId: string) => {
    set((state) => ({
      pendingChangeSets: state.pendingChangeSets.filter(
        (c: PendingChangeSet) => c.tempId !== tempId
      ),
    }));
  },

  addPendingTagRuleChangeSet: (input: AddPendingTagRuleChangeSetInput): PendingTagRuleChangeSet => {
    const entry: PendingTagRuleChangeSet = {
      tempId: `temp:tagrules:${crypto.randomUUID()}`,
      changeSet: input.changeSet,
      appliedAt: new Date().toISOString(),
      source: input.source,
    };

    set((prev) => ({ pendingTagRuleChangeSets: [...prev.pendingTagRuleChangeSets, entry] }));
    return entry;
  },
  listPendingTagRuleChangeSets: (): PendingTagRuleChangeSet[] =>
    useImportStore.getState().pendingTagRuleChangeSets,
  removePendingTagRuleChangeSet: (tempId: string) => {
    set((state) => ({
      pendingTagRuleChangeSets: state.pendingTagRuleChangeSets.filter(
        (c: PendingTagRuleChangeSet) => c.tempId !== tempId
      ),
    }));
  },

  updateTransaction: (transaction, updates) => {
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
    const state = useImportStore.getState();
    const allTransactions: ProcessedTransaction[] = [
      ...state.processedTransactions.uncertain,
      ...state.processedTransactions.failed,
    ];
    return findSimilarTransactions(transaction, allTransactions);
  },

  updateTransactionTags: (checksum, tags) => {
    set((state) => ({
      confirmedTransactions: state.confirmedTransactions.map((t) =>
        t.checksum === checksum ? { ...t, tags } : t
      ),
    }));
  },
}));
