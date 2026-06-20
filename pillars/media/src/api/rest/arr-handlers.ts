/**
 * Composer for the `arr.*` sub-router (Radarr + Sonarr).
 *
 * The contract (`mediaArrContract`) flattens the Radarr and Sonarr route
 * maps into one sub-router, so this stitches the two per-service handler
 * factories back into a single flat implementation. The Radarr/Sonarr
 * splits live in `arr-radarr-handlers.ts` / `arr-sonarr-handlers.ts`
 * (per-file line cap); shared client guards live in `arr-handlers-shared.ts`.
 */
import { type MediaDb } from '../../db/index.js';
import { makeRadarrHandlers } from './arr-radarr-handlers.js';
import { makeSonarrHandlers } from './arr-sonarr-handlers.js';

export function makeArrHandlers(db: MediaDb) {
  return {
    ...makeRadarrHandlers(db),
    ...makeSonarrHandlers(),
  };
}
