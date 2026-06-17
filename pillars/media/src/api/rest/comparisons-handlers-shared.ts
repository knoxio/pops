/**
 * Shared error mapping for the comparisons handler factories.
 *
 * Translates `@pops/media` comparisons db domain errors to the shared
 * HttpError subclasses the REST error mapping understands (NotFound → 404,
 * Conflict → 409, Inactive/InvalidWinner → 400). Anything else rethrows.
 */
import {
  ComparisonNotFoundError,
  DimensionConflictError,
  DimensionNotFoundError,
  InactiveDimensionError,
  InvalidWinnerError,
  MediaScoreNotFoundError,
} from '../../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';

function mapComparisonError(err: unknown): never {
  if (err instanceof DimensionNotFoundError) throw new NotFoundError('Dimension', String(err.id));
  if (err instanceof ComparisonNotFoundError) {
    throw new NotFoundError('Comparison', String(err.id));
  }
  if (err instanceof MediaScoreNotFoundError) throw new NotFoundError('MediaScore', err.message);
  if (err instanceof DimensionConflictError) throw new ConflictError(err.message);
  if (err instanceof InactiveDimensionError || err instanceof InvalidWinnerError) {
    throw new ValidationError(err.message);
  }
  throw err;
}

/** Run a handler body, translating comparisons domain errors to HttpErrors. */
export function guard<T extends { status: number; body: unknown }>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    return mapComparisonError(err);
  }
}
