/**
 * Shared error mapping for the rotation handler factories.
 *
 * Translates `@pops/media` rotation db domain errors to the shared HttpError
 * subclasses the REST error mapping understands (NotFound → 404, manual-source
 * / excluded / disabled → 409, not-pending → 400). Anything else rethrows.
 */
import {
  RotationCandidateNotFoundError,
  RotationCandidateNotPendingError,
  RotationManualSourceProtectedError,
  RotationMovieExcludedError,
  RotationSourceDisabledError,
  RotationSourceNotFoundError,
} from '../../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';

function mapRotationError(err: unknown): never {
  if (err instanceof RotationCandidateNotFoundError) {
    throw new NotFoundError('Rotation candidate', String(err.id));
  }
  if (err instanceof RotationSourceNotFoundError) {
    throw new NotFoundError('Rotation source', String(err.id));
  }
  if (err instanceof RotationCandidateNotPendingError) throw new ValidationError(err.message);
  if (err instanceof RotationMovieExcludedError) throw new ConflictError(err.message);
  if (err instanceof RotationSourceDisabledError) throw new ConflictError(err.message);
  if (err instanceof RotationManualSourceProtectedError) throw new ConflictError(err.message);
  throw err;
}

/** Run a (sync or async) handler body, translating rotation domain errors. */
export async function guardRotation<T extends { status: number; body: unknown }>(
  fn: () => T | Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    return mapRotationError(err);
  }
}
