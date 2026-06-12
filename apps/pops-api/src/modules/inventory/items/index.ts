/**
 * @deprecated Theme 13 PRD-173 PR 1 — write paths moved to
 * `apps/pops-inventory-api/src/modules/items/`. Re-exports here keep
 * the legacy pops-api inventory router (fall-through) compiling until
 * the slice's dispatcher cutover lands.
 */
export { inventoryRouter } from './router.js';
export * as inventoryService from './service.js';
export * from './types.js';
