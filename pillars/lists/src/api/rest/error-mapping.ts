/**
 * Map lists service errors to ts-rest response envelopes.
 *
 * Replaces the old tRPC-flavoured `routers/error-mapping.ts`. Anything
 * unrecognised is re-thrown so Express's error pipeline (and the test
 * suite) sees the underlying stack rather than a swallowed 500.
 */
import { ListItemNotFoundError, ListNotFoundError } from '../../db/index.js';
import { isForeignKeyConstraintError, isUniqueConstraintError } from '../shared/sqlite-errors.js';

export interface ErrorBody {
  message: string;
  code?: string;
}

export interface MappedHttpError {
  status: 404 | 409;
  body: ErrorBody;
}

export function tryMapServiceError(err: unknown): MappedHttpError | null {
  if (err instanceof ListNotFoundError || err instanceof ListItemNotFoundError) {
    return { status: 404, body: { message: err.message, code: 'NOT_FOUND' } };
  }
  if (isUniqueConstraintError(err)) {
    return {
      status: 409,
      body: { message: 'A list with that identity already exists', code: 'CONFLICT_UNIQUE' },
    };
  }
  if (isForeignKeyConstraintError(err)) {
    return {
      status: 409,
      body: { message: 'Operation rejected by a foreign key constraint', code: 'CONFLICT_FK' },
    };
  }
  return null;
}

export function runOrThrowHttp<T>(fn: () => T): T | MappedHttpError {
  try {
    return fn();
  } catch (err) {
    const mapped = tryMapServiceError(err);
    if (mapped !== null) return mapped;
    throw err as Error;
  }
}

export function isMappedHttpError(value: unknown): value is MappedHttpError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'body' in value &&
    (value as { status: unknown }).status !== undefined &&
    typeof (value as { body: unknown }).body === 'object'
  );
}
