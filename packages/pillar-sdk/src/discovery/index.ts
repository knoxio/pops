export { lookupPillar, pillarRegistry } from './api.js';
export {
  setRegistryUrl,
  setCacheTtlMs,
  invalidateRegistryCache,
  disposeDiscoveryClient,
  DEFAULT_REGISTRY_URL,
  DEFAULT_CACHE_TTL_MS,
  MIN_CACHE_TTL_MS,
} from './cache.js';
export { RegistryUnreachableError, type PillarSnapshot, type RegistrySnapshot } from './types.js';
