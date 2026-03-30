/**
 * Discovery module — preference profile and recommendations.
 */
export { discoveryRouter } from "./router.js";
export type {
  PreferenceProfile,
  GenreAffinity,
  DimensionWeight,
  GenreDistribution,
} from "./types.js";
export { CONTEXT_COLLECTIONS, getActiveCollections } from "./context-collections.js";
export type { ContextCollection } from "./context-collections.js";
