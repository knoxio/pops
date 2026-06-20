/**
 * Shared plumbing for the `arr.*` Radarr/Sonarr handler factories.
 *
 * Config is ENV-ONLY: when a service is unconfigured its client factory
 * returns `null`, so the `requireX` guards raise `ConflictError` (409)
 * before any upstream call is attempted.
 */
import { getRadarrClient, getSonarrClient } from '../clients/arr/index.js';
import { ConflictError } from '../shared/errors.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaArrContract } from '../../contract/rest-arr.js';
import type { RadarrClient, SonarrClient } from '../clients/arr/index.js';

export type ArrReq = ServerInferRequest<typeof mediaArrContract>;

export function requireRadarr(): RadarrClient {
  const client = getRadarrClient();
  if (!client) throw new ConflictError('Radarr is not configured');
  return client;
}

export function requireSonarr(): SonarrClient {
  const client = getSonarrClient();
  if (!client) throw new ConflictError('Sonarr is not configured');
  return client;
}
