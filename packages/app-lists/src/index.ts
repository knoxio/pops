/**
 * @pops/app-lists — Generic lists schema + service layer (PRD-112).
 *
 * Public surface: the Drizzle table objects, typed errors, and pure service
 * functions over `ListsDb`. Frontend bits (manifest, routes, pages) are added
 * by Epic 04 PRDs in a separate package layer.
 */
export * from './db/schema.js';
export * from './db/errors.js';
export * from './db/services/lists.js';
export * from './db/services/list-items.js';
export type { ListsDb } from './db/services/internal.js';
