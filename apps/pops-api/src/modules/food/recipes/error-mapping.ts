/**
 * Map typed PRD-107 / PRD-116 errors → TRPCError or structured results.
 */
import { TRPCError } from '@trpc/server';

import {
  CannotEditPublishedVersion,
  CannotPromoteUncompiledVersion,
  ConcurrentPromotion,
  SlugAlreadyRegisteredError,
} from '@pops/app-food-db';

import type { PromoteReason, PromoteResult } from './types.js';

export class MissingRecipeHeaderError extends Error {
  constructor() {
    super('DSL is missing an @recipe(slug=...) header');
    this.name = 'MissingRecipeHeaderError';
  }
}

/**
 * Map a create-recipe failure to a TRPCError. `MissingRecipeHeader` is the
 * editor's most common rejection — it gets BAD_REQUEST with a `cause` so the
 * client can show the underlying parse-error span when surfacing the error
 * inline.
 */
export function mapCreateRecipeError(err: unknown): never {
  if (err instanceof MissingRecipeHeaderError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  if (err instanceof SlugAlreadyRegisteredError) {
    throw new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
  }
  throw err as Error;
}

// PRD-107's `updateDraftVersion` / `promoteVersion` throw an untyped
// `Error("recipe_version #<id> not found")` when the id doesn't exist.
// Detect that shape so we can map it cleanly instead of leaking a 500.
function isMissingVersionError(err: unknown): boolean {
  return err instanceof Error && /recipe_version #\d+ not found/i.test(err.message);
}

/**
 * `saveDraft` operates only on draft rows; published/archived rows reject
 * with a typed `CannotEditPublishedVersion`. A missing version row maps to
 * `NOT_FOUND` rather than the raw service `Error`.
 */
export function mapSaveDraftError(err: unknown): never {
  if (err instanceof CannotEditPublishedVersion) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  if (isMissingVersionError(err)) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: (err as Error).message,
      cause: err,
    });
  }
  throw err as Error;
}

/**
 * `promote` returns a discriminated result instead of throwing because the
 * editor surfaces the reason inline (banner / toast) rather than blowing up
 * the page. All four failure modes are user-actionable.
 */
export function promoteFailure(reason: PromoteReason): PromoteResult {
  return { ok: false, reason };
}

export function mapPromoteError(err: unknown): PromoteResult | never {
  if (err instanceof ConcurrentPromotion) {
    return promoteFailure('ConcurrentPromotion');
  }
  if (err instanceof CannotPromoteUncompiledVersion) {
    return promoteFailure('CannotPromoteUncompiledVersion');
  }
  if (isMissingVersionError(err)) {
    return promoteFailure('VersionNotFound');
  }
  throw err as Error;
}
