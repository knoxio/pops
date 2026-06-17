/**
 * `arr.*` sub-router — Radarr + Sonarr download-manager integration.
 *
 * Ported from the monolith `media.arr.*` tRPC router. Wire shapes are
 * preserved (each route's response mirrors the legacy procedure output)
 * with one re-architecture: config is ENV-ONLY (`RADARR_URL`,
 * `RADARR_API_KEY`, `SONARR_URL`, `SONARR_API_KEY`, plus
 * `RADARR_QUALITY_PROFILE_ID` / `RADARR_ROOT_FOLDER_PATH` for
 * download-and-protect). The legacy `saveSettings` mutation was dropped —
 * the server cannot write its own env at runtime; see `clients/arr/config.ts`.
 *
 * The route maps are split across `rest-arr-radarr.ts` / `rest-arr-sonarr.ts`
 * (per-file line cap); this file flattens them into one sub-router so the
 * operation ids stay `arr.<route>`.
 */
import { initContract } from '@ts-rest/core';

import { radarrRoutes } from './rest-arr-radarr.js';
import { sonarrRoutes } from './rest-arr-sonarr.js';

const c = initContract();

export const mediaArrContract = c.router({
  ...radarrRoutes,
  ...sonarrRoutes,
});
