import type {
  ChangeSet,
  CommitResult,
  ConfirmedTransaction,
  ImportWarning,
  ParsedTransaction,
  ProcessedTransaction as BaseProcessedTransaction,
  TagRuleChangeSet,
} from '@pops/finance';

/**
 * Which CSV dialect to parse the upload with (see `bank-dialect.ts`) — a
 * label picked on the Upload step to select a parser, not a claim about
 * which real account (`accountId`) the rows belong to. Two accounts at the
 * same bank share one dialect (two ANZ credit cards, say), so this value
 * must never be used to identify or resolve an account.
 */
export type BankDialectId = 'ANZ' | 'ANZ Credit Card' | 'Amex' | 'ING' | 'Up';
export type { ChangeSet };
export type EntityType = 'company' | 'person' | 'government' | 'bank';

export interface PendingEntity {
  tempId: string;
  name: string;
  type: EntityType;
}

export interface AddPendingEntityInput {
  name: string;
  type: EntityType;
}

export interface PendingChangeSet {
  tempId: string;
  changeSet: ChangeSet;
  appliedAt: string;
  source: string;
}

export interface AddPendingChangeSetInput {
  changeSet: ChangeSet;
  source: string;
}

export interface PendingTagRuleChangeSet {
  tempId: string;
  changeSet: TagRuleChangeSet;
  appliedAt: string;
  source: string;
  /**
   * New-vocabulary tags the user accepted in the tag-rule dialog. Only those
   * are upserted into the vocabulary at commit, so a tag the user unchecked
   * never lands. Absent for flows with no accept/decline step (batch rule
   * creation), where every tag the ChangeSet carries is upserted.
   */
  acceptedNewTags?: string[];
  /**
   * Checksums of the confirmed transactions this rule's tags were read from,
   * so the commit payload can re-check the rule against those rows' *current*
   * tags instead of the copy taken when it was staged (POPS-3106).
   *
   * Optional on the stored shape because sessions persisted before this
   * existed have none; required on the input, so every staging path has to say
   * where its tags came from.
   */
  sourceChecksums?: string[];
}

export interface AddPendingTagRuleChangeSetInput {
  changeSet: TagRuleChangeSet;
  source: string;
  acceptedNewTags?: string[];
  sourceChecksums: string[];
}

export interface ProcessedTransaction extends BaseProcessedTransaction {
  manuallyEdited?: boolean;
}

/** Where a draft's rows came from, as the draft list reports it; a fresh run is a file run until it says otherwise. */
export type ImportDraftSource =
  | { kind: 'file'; dialectId: string | null; fileNames: string[] }
  | { kind: 'live'; provider: 'up' };

export interface ImportStore {
  /** The server draft this run writes through to; null until the first rows exist (finance ADR-005). */
  draftId: string | null;
  /** The draft's source, from the server; decides which steps exist. Not written back. */
  draftSource: ImportDraftSource | null;
  /** Live only: the balance the provider reported with the newest row, minor units. Not written back. */
  draftBalanceCents: number | null;
  currentStep: number;
  files: File[];
  sourceFileNames: string[];
  /** The real account transactions land in — `null` until picked in the Upload step's account field. */
  accountId: string | null;
  /** Kept alongside `accountId` so the picked account survives a persisted-state reload without a refetch. */
  accountName: string;
  dialectId: BankDialectId;
  headers: string[];
  rows: Record<string, string>[];
  columnMap: {
    date: string;
    description: string;
    amount: string;
    location?: string;
  };
  parsedTransactions: ParsedTransaction[];
  parsedTransactionsFingerprint: string;
  processSessionId: string | null;
  processedForFingerprint: string | null;
  processedTransactions: {
    matched: ProcessedTransaction[];
    uncertain: ProcessedTransaction[];
    failed: ProcessedTransaction[];
    skipped: ProcessedTransaction[];
    warnings?: ImportWarning[];
  };
  confirmedTransactions: ConfirmedTransaction[];
  commitResult: CommitResult | null;
  pendingEntities: PendingEntity[];
  pendingChangeSets: PendingChangeSet[];
  pendingTagRuleChangeSets: PendingTagRuleChangeSet[];
  manuallyResolvedChecksums: string[];

  setFiles: (files: File[]) => void;
  setAccount: (accountId: string, accountName: string) => void;
  setDialectId: (dialectId: BankDialectId) => void;
  setHeaders: (headers: string[]) => void;
  setRows: (rows: Record<string, string>[]) => void;
  setColumnMap: (columnMap: ImportStore['columnMap']) => void;
  setParsedTransactions: (parsed: ParsedTransaction[]) => void;
  setProcessSessionId: (sessionId: string | null) => void;
  setProcessedTransactions: (processed: ImportStore['processedTransactions']) => void;
  setConfirmedTransactions: (confirmed: ConfirmedTransaction[]) => void;
  setCommitResult: (result: CommitResult | null) => void;
  setDraftId: (draftId: string | null) => void;
  setDraftSource: (source: ImportDraftSource | null, balanceCents: number | null) => void;

  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  reset: () => void;

  addPendingEntity: (
    input: AddPendingEntityInput,
    dbEntities?: Array<{ name: string }>
  ) => PendingEntity;
  listPendingEntities: () => PendingEntity[];
  removePendingEntity: (tempId: string) => void;

  addPendingChangeSet: (input: AddPendingChangeSetInput) => PendingChangeSet;
  listPendingChangeSets: () => PendingChangeSet[];
  removePendingChangeSet: (tempId: string) => void;

  addPendingTagRuleChangeSet: (input: AddPendingTagRuleChangeSetInput) => PendingTagRuleChangeSet;
  listPendingTagRuleChangeSets: () => PendingTagRuleChangeSet[];
  removePendingTagRuleChangeSet: (tempId: string) => void;

  findSimilar: (transaction: ProcessedTransaction) => ProcessedTransaction[];

  updateTransactionTags: (checksum: string, tags: string[]) => void;

  markChecksumsResolved: (checksums: string[]) => void;
}

export const initialState = {
  draftId: null,
  draftSource: null,
  draftBalanceCents: null,
  currentStep: 1,
  files: [],
  sourceFileNames: [],
  accountId: null,
  accountName: '',
  dialectId: 'Amex' as BankDialectId,
  headers: [],
  rows: [],
  columnMap: { date: '', description: '', amount: '' },
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
  manuallyResolvedChecksums: [],
};

/**
 * Produce a content fingerprint for a list of parsed transactions.
 */
export function fingerprintParsedTransactions(txns: ParsedTransaction[]): string {
  if (txns.length === 0) return '';
  return txns.map((t) => t.checksum).join('|');
}

export const downstreamReset: Pick<
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
  | 'manuallyResolvedChecksums'
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
  manuallyResolvedChecksums: initialState.manuallyResolvedChecksums,
};

export function isSameFile(a: File | null, b: File | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/**
 * Positional comparison — reordering a batch reorders the merged rows, which is
 * a genuinely different parse, so it must cascade the downstream reset too.
 */
export function isSameFileSet(a: File[], b: File[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((file, i) => isSameFile(file, b[i] ?? null));
}
