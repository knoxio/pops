/**
 * Discovery module — preference profile and recommendations.
 */
export type { ContextCollection } from './context-collections.js';
export { CONTEXT_COLLECTIONS, getActiveCollections } from './context-collections.js';
export { discoveryRouter } from './router.js';
export type {
  DimensionWeight,
  GenreAffinity,
  GenreDistribution,
  PreferenceProfile,
} from './types.js';
