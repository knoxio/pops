/**
 * Local re-export of the finance domain tables.
 *
 * Canonical definitions live in `@pops/db-types/src/schema/*.ts` so the
 * drizzle-kit config (which globs `packages/db-types/src/schema/*`) picks
 * them up and the rest of the platform sees a single schema barrel.
 *
 * Services in this package import from here for ergonomics and so that
 * the finance module's read surface stays self-describing.
 *
 * Mirrors the `@pops/core-db` schema re-export pattern.
 */
export { tagVocabulary, transactionTagRules, wishList } from '@pops/db-types';
