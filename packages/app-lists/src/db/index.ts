/**
 * @pops/app-lists/db — server-only entrypoint for the schema + service layer.
 *
 * Kept separate from the root `@pops/app-lists` entrypoint so the browser
 * bundle (which only needs manifest/navConfig/routes) doesn't pull
 * better-sqlite3 / drizzle into the shell. Consumers running on Node (API,
 * food seed) import from here.
 *
 * Mirrors the split convention used by `@pops/app-food` (frontend) +
 * `@pops/app-food-db` (server-only sibling package).
 */
export * from './schema.js';
export * from './errors.js';
export * from './services/lists.js';
export * from './services/list-items.js';
export type { ListsDb } from './services/internal.js';
