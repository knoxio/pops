import { TRPCError } from '@trpc/server';

import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors.js';

/**
 * Convert known service errors into appropriate TRPC errors.
 */
export function rethrowKnownErrors(err: unknown): never {
  if (err instanceof NotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof ValidationError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  if (err instanceof ConflictError) {
    throw new TRPCError({ code: 'CONFLICT', message: err.message });
  }
  throw err;
}
