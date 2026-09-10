/**
 * The wizard's persisted slice as the server writes it for a live draft
 * (POPS-3333, finance ADR-005). The client owns the shape;
 * `LiveDraftPayloadSchema` is the server's reading of the fields it writes,
 * and a bump to the client's shape version reads these drafts as unusable
 * like any other. `parsedTransactions` and `processedTransactions` carry the
 * same fingerprint, which is what makes the wizard open a live draft on
 * Review rather than re-running Process.
 */
import { z } from 'zod';

import {
  CommitResultSchema,
  ConfirmedTransactionSchema,
  ParsedTransactionSchema,
  ProcessImportOutputSchema,
} from '../../../contract/rest-imports-schemas.js';

import type { ImportDraftRow } from '../../../db/services/import-drafts.js';

export const LiveDraftPayloadSchema = z.object({
  currentStep: z.number().int(),
  sourceFileNames: z.array(z.string()),
  accountId: z.string().nullable(),
  accountName: z.string(),
  dialectId: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.string())),
  columnMap: z.object({
    date: z.string(),
    description: z.string(),
    amount: z.string(),
    location: z.string().optional(),
  }),
  parsedTransactions: z.array(ParsedTransactionSchema),
  parsedTransactionsFingerprint: z.string(),
  processSessionId: z.string().nullable(),
  processedForFingerprint: z.string().nullable(),
  processedTransactions: ProcessImportOutputSchema,
  confirmedTransactions: z.array(ConfirmedTransactionSchema),
  commitResult: CommitResultSchema.nullable(),
  pendingEntities: z.array(z.unknown()),
  pendingChangeSets: z.array(z.unknown()),
  pendingTagRuleChangeSets: z.array(z.unknown()),
  manuallyResolvedChecksums: z.array(z.string()),
});

export type LiveDraftPayload = z.infer<typeof LiveDraftPayloadSchema>;

/** The wizard step a live draft lands on: Process, with its results already in. */
const PROCESS_STEP = 3;

export interface LiveDraftTarget {
  accountId: string;
  accountName: string;
}

export function emptyLiveDraftPayload(target: LiveDraftTarget): LiveDraftPayload {
  return {
    currentStep: PROCESS_STEP,
    sourceFileNames: [],
    accountId: target.accountId,
    accountName: target.accountName,
    dialectId: 'Up',
    headers: [],
    rows: [],
    columnMap: { date: '', description: '', amount: '' },
    parsedTransactions: [],
    parsedTransactionsFingerprint: '',
    processSessionId: null,
    processedForFingerprint: null,
    processedTransactions: { matched: [], uncertain: [], failed: [], skipped: [] },
    confirmedTransactions: [],
    commitResult: null,
    pendingEntities: [],
    pendingChangeSets: [],
    pendingTagRuleChangeSets: [],
    manuallyResolvedChecksums: [],
  };
}

export function readLiveDraftPayload(row: ImportDraftRow): LiveDraftPayload {
  return LiveDraftPayloadSchema.parse(JSON.parse(row.payload));
}

/** The same fingerprint the wizard computes, so a live draft opens with its results recognised. */
export function fingerprintOf(parsed: readonly { checksum: string }[]): string {
  return parsed.map((t) => t.checksum).join('|');
}

export interface DraftCounts {
  rowCount: number;
  unresolvedCount: number;
  dateFrom: string | null;
  dateTo: string | null;
}

export function countsOf(payload: LiveDraftPayload): DraftCounts {
  const resolved = new Set(payload.manuallyResolvedChecksums);
  const { uncertain, failed } = payload.processedTransactions;
  const dates = payload.parsedTransactions.map((t) => t.date).toSorted();
  return {
    rowCount: payload.parsedTransactions.length,
    unresolvedCount: [...uncertain, ...failed].filter((t) => !resolved.has(t.checksum)).length,
    dateFrom: dates[0] ?? null,
    dateTo: dates.at(-1) ?? null,
  };
}

export function stamped(payload: LiveDraftPayload): LiveDraftPayload {
  const fingerprint = fingerprintOf(payload.parsedTransactions);
  return {
    ...payload,
    parsedTransactionsFingerprint: fingerprint,
    processedForFingerprint: fingerprint,
  };
}
