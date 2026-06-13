/**
 * Thin shims that forward CRUD operations on `transaction_corrections` to
 * `@pops/finance-db`'s `transactionCorrectionsService`.
 *
 * Reads and writes route through `getFinanceDrizzle()` — the finance-owned
 * `transaction_corrections` table lives in `finance.db`.
 *
 * Domain errors thrown by the package (`TransactionCorrectionNotFoundError`)
 * are translated to `NotFoundError` so the existing router layer (and the
 * tRPC error envelope it depends on) keeps returning `404 NOT_FOUND` with
 * the same `common.notFound` i18n key.
 */
import {
  transactionCorrectionsService,
  TransactionCorrectionNotFoundError,
  type CreateTransactionCorrectionInput,
  type UpdateTransactionCorrectionInput,
} from '@pops/finance-db';

import { getFinanceDrizzle } from '../../../../db/finance-handle.js';
import { NotFoundError } from '../../../../shared/errors.js';

import type { CorrectionRow, CreateCorrectionInput, UpdateCorrectionInput } from '../types.js';

function rethrowAsNotFound(err: unknown, id: string): never {
  if (err instanceof TransactionCorrectionNotFoundError) {
    throw new NotFoundError('Correction', id);
  }
  throw err;
}

export function listCorrections(
  minConfidence?: number,
  limit: number = 50,
  offset: number = 0,
  matchType?: 'exact' | 'contains' | 'regex'
): { rows: CorrectionRow[]; total: number } {
  return transactionCorrectionsService.listTransactionCorrections(getFinanceDrizzle(), {
    minConfidence,
    matchType,
    limit,
    offset,
  });
}

export function getCorrection(id: string): CorrectionRow {
  try {
    return transactionCorrectionsService.getTransactionCorrection(getFinanceDrizzle(), id);
  } catch (err) {
    rethrowAsNotFound(err, id);
  }
}

export function createOrUpdateCorrection(input: CreateCorrectionInput): CorrectionRow {
  const packageInput: CreateTransactionCorrectionInput = {
    descriptionPattern: input.descriptionPattern,
    matchType: input.matchType,
    entityId: input.entityId,
    entityName: input.entityName,
    location: input.location,
    tags: input.tags,
    transactionType: input.transactionType,
    priority: input.priority,
  };
  return transactionCorrectionsService.createOrUpdateTransactionCorrection(
    getFinanceDrizzle(),
    packageInput
  );
}

export function updateCorrection(id: string, input: UpdateCorrectionInput): CorrectionRow {
  const packageInput: UpdateTransactionCorrectionInput = {
    descriptionPattern: input.descriptionPattern,
    matchType: input.matchType,
    entityId: input.entityId,
    entityName: input.entityName,
    location: input.location,
    tags: input.tags,
    transactionType: input.transactionType,
    isActive: input.isActive,
    confidence: input.confidence,
    priority: input.priority,
  };
  try {
    return transactionCorrectionsService.updateTransactionCorrection(
      getFinanceDrizzle(),
      id,
      packageInput
    );
  } catch (err) {
    rethrowAsNotFound(err, id);
  }
}

export function deleteCorrection(id: string): void {
  try {
    transactionCorrectionsService.deleteTransactionCorrection(getFinanceDrizzle(), id);
  } catch (err) {
    rethrowAsNotFound(err, id);
  }
}

export function incrementCorrectionUsage(id: string): void {
  transactionCorrectionsService.incrementTransactionCorrectionUsage(getFinanceDrizzle(), id);
}

export function adjustConfidence(id: string, delta: number): void {
  try {
    transactionCorrectionsService.adjustTransactionCorrectionConfidence(
      getFinanceDrizzle(),
      id,
      delta
    );
  } catch (err) {
    rethrowAsNotFound(err, id);
  }
}
