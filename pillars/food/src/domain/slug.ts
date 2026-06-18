import { InvalidSlugError } from '../db/errors.js';

/**
 * Canonical slug grammar for the food domain: lowercase ASCII kebab-case,
 * matching `[a-z0-9]+(-[a-z0-9]+)*`. Empty strings, leading/trailing
 * hyphens, double hyphens, uppercase, and any non-ASCII are rejected.
 *
 * See `pillars/food/docs/prds/106-ingredient-model/README.md` Business Rules.
 */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** Throw `InvalidSlugError` if the slug doesn't match the canonical grammar. */
export function assertValidSlug(slug: string): void {
  if (typeof slug !== 'string' || slug.length === 0) {
    throw new InvalidSlugError(String(slug), 'must be a non-empty string');
  }
  if (!SLUG_RE.test(slug)) {
    throw new InvalidSlugError(slug, 'must be lowercase kebab-case [a-z0-9]+(-[a-z0-9]+)*');
  }
}
