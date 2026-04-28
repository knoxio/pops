/**
 * Reflex service singleton (PRD-089).
 *
 * Follows the same pattern as the cerebrum instance.ts — process-scoped
 * singletons for config-dependent services, DB resolved per-call.
 */
import { getEngramRoot } from '../instance.js';
import { ReflexService } from './reflex-service.js';

let cachedService: ReflexService | null = null;

/** Return the shared ReflexService singleton, initialised on first access. */
export function getReflexService(): ReflexService {
  if (!cachedService) {
    cachedService = new ReflexService(getEngramRoot());
    cachedService.start();
  }
  return cachedService;
}

/** Test hook — drop the cached service so tests can rebind. */
export function resetReflexService(): void {
  if (cachedService) {
    void cachedService.stop();
    cachedService = null;
  }
}
