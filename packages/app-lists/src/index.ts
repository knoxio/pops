/**
 * @pops/app-lists — Generic lists module.
 *
 * Frontend surface (manifest, navConfig, routes) added by PRD-139; CRUD UI +
 * tRPC procedures land with PRD-140. Schema + service layer are owned by
 * PRD-112. Lists is theme-agnostic — food (PRD-142) is the first consumer.
 */
export { manifest } from './manifest';
export { navConfig, routes } from './routes';
export * from './db/schema.js';
export * from './db/errors.js';
export * from './db/services/lists.js';
export * from './db/services/list-items.js';
export type { ListsDb } from './db/services/internal.js';
