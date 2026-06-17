/**
 * Barrel for `@pops/media`. Sub-paths (`/types`, `/schemas`, `/errors`)
 * are the preferred imports for consumers — the barrel exists for
 * ergonomics and for the registry/SDK code paths that pull everything.
 */
export * from './types/index.js';
export * from './schemas/index.js';
export * from './errors.js';
export type { MediaRouter } from './router.js';
export type { MediaContract } from './manifest.js';
