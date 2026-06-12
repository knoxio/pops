/**
 * Barrel for `@pops/finance-contract`. Sub-paths
 * (`/types`, `/schemas`, `/router`, `/errors`, `/manifest`) are the
 * preferred imports for consumers — the barrel exists for ergonomics and
 * for the registry/SDK code paths that pull everything.
 */
export * from './types/index.js';
export * from './schemas/index.js';
export * from './errors.js';
export type { FinanceRouter } from './router.js';
export type { FinanceContract } from './manifest.js';
