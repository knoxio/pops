/**
 * Barrel for `@pops/lists-contract`. Sub-paths
 * (`/types`, `/schemas`, `/router`, `/errors`, `/manifest`) are the
 * preferred imports for consumers — the barrel exists for ergonomics and
 * for the registry/SDK code paths that pull everything.
 */
export * from './types/index.js';
export * from './schemas/index.js';
export * from './errors.js';
export type { ListsRouter } from './router.js';
export type { ListsContract } from './manifest.js';
