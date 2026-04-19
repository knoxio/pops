/**
 * Arr tRPC router — Radarr/Sonarr integration endpoints.
 */
import { router } from '../../../trpc.js';
import { radarrProcedures } from './radarr-router.js';
import { sonarrProcedures } from './sonarr-router.js';

export const arrRouter = router({
  ...radarrProcedures,
  ...sonarrProcedures,
});
