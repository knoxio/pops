/**
 * Map typed PRD-107 / PRD-116 errors → HttpError or structured results.
 */
import {
  CannotEditPublishedVersion,
  CannotPromoteUncompiledVersion,
  SlugAlreadyRegisteredError,
} from '../../../db/index.js';
import { ConflictError, HttpError } from '../../shared/errors.js';

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
    throw new HttpError(400, err.message, err, 'common.validationFailed');
  }
  if (err instanceof SlugAlreadyRegisteredError) throw new ConflictError(err.message);
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
    throw new HttpError(400, err.message, err, 'common.validationFailed');
  }
  if (isMissingVersionError(err)) {
    throw new HttpError(404, (err as Error).message, err, 'common.notFound');
  }
  throw err as Error;
}

/**
 * `promote` returns a discriminated result instead of throwing because the
 * editor surfaces the reason inline (banner / toast) rather than blowing up
 * the page. All four failure modes are user-actionable.
 *
 * `ConcurrentPromotion` arrives from `promoteVersion` as a structured result
 * (PRD-136 amendment to PRD-107) and is forwarded by the caller; this mapper
 * only handles the still-thrown variants: `CannotPromoteUncompiledVersion`
 * and the "not found" pre-validation Error.
 */
export function promoteFailure(reason: PromoteReason): PromoteResult {
  return { ok: false, reason };
}

export function mapPromoteError(err: unknown): PromoteResult | never {
  if (err instanceof CannotPromoteUncompiledVersion) {
    return promoteFailure('CannotPromoteUncompiledVersion');
  }
  if (isMissingVersionError(err)) {
    return promoteFailure('VersionNotFound');
  }
  throw err as Error;
}
