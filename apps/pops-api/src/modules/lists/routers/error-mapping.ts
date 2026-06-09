/**
 * Shared error-mapping for the lists router (PRD-140).
 *
 * Mirrors the conversions router pattern:
 *   - `ListNotFoundError` / `ListItemNotFoundError` → tRPC `NOT_FOUND`
 *   - SQLite `UNIQUE` constraint → tRPC `CONFLICT`
 *   - SQLite `FOREIGN KEY` constraint → tRPC `CONFLICT`
 *   - anything else propagates as-is
 */
import { TRPCError } from '@trpc/server';

import { ListItemNotFoundError, ListNotFoundError } from '@pops/app-lists-db';

import {
  isForeignKeyConstraintError,
  isUniqueConstraintError,
} from '../../../shared/sqlite-errors.js';

function isTypedNotFound(err: unknown): err is ListNotFoundError | ListItemNotFoundError {
  return err instanceof ListNotFoundError || err instanceof ListItemNotFoundError;
}

export function mapServiceError(err: unknown): never {
  if (isTypedNotFound(err)) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
  }
  if (isUniqueConstraintError(err)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'A list with that identity already exists',
      cause: err,
    });
  }
  if (isForeignKeyConstraintError(err)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Operation rejected by a foreign key constraint',
      cause: err,
    });
  }
  throw err as Error;
}

export function runOrMap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    mapServiceError(err);
  }
}
