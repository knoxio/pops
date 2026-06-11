/**
 * Thin shims that forward CRUD operations on `transaction_corrections` to
 * `@pops/finance-db`'s `transactionCorrectionsService`.
 *
 * Track N3 phase 1 PR 3 routing flip: the underlying drizzle handle (and
 * the on-disk SQLite file) is unchanged — `getDrizzle()` still resolves to
 * the shared `pops.db` so the in-tree imports pipeline (the other consumer
 * of this table) keeps reading and writing the same rows. Only the code
 * path moves from the in-tree implementation to the package one. PR 4 of
 * phase 1 will delete this shim once the imports pipeline (N6) is also on
 * the package and the handle can shift to `getFinanceDrizzle()`.
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

import { getDrizzle } from '../../../../db.js';
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
  return transactionCorrectionsService.listTransactionCorrections(getDrizzle(), {
    minConfidence,
    matchType,
    limit,
    offset,
  });
}

export function getCorrection(id: string): CorrectionRow {
  try {
    return transactionCorrectionsService.getTransactionCorrection(getDrizzle(), id);
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
    getDrizzle(),
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
      getDrizzle(),
      id,
      packageInput
    );
  } catch (err) {
    rethrowAsNotFound(err, id);
  }
}

export function deleteCorrection(id: string): void {
  try {
    transactionCorrectionsService.deleteTransactionCorrection(getDrizzle(), id);
  } catch (err) {
    rethrowAsNotFound(err, id);
  }
}

export function incrementCorrectionUsage(id: string): void {
  transactionCorrectionsService.incrementTransactionCorrectionUsage(getDrizzle(), id);
}

export function adjustConfidence(id: string, delta: number): void {
  try {
    transactionCorrectionsService.adjustTransactionCorrectionConfidence(getDrizzle(), id, delta);
  } catch (err) {
    rethrowAsNotFound(err, id);
  }
}
