/**
 * Local re-export of the lists domain tables.
 *
 * Canonical definitions live in `@pops/db-types/src/schema/lists.ts` so the
 * drizzle-kit config (which globs `packages/db-types/src/schema/*`) picks
 * them up and the rest of the platform sees a single schema barrel.
 *
 * Services in this package import from here for ergonomics.
 */
export { listItems, lists } from '@pops/db-types';
export type {
  ListInsert,
  ListItemInsert,
  ListItemRefKind,
  ListItemRow,
  ListKind,
  ListRow,
} from '@pops/db-types';
