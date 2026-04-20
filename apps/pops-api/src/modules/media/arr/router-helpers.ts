import { TRPCError } from '@trpc/server';

import * as arrService from './service.js';
import { ArrApiError } from './types.js';

import type { RadarrClient } from './radarr-client.js';
import type { SonarrClient } from './sonarr-client.js';

const MASKED_KEY = '••••••••';

export { MASKED_KEY };

/**
 * Resolve the API key from a form value, falling back to saved settings if masked.
 */
export function resolveArrApiKey(formKey: string, service: 'radarr' | 'sonarr'): string | null {
  if (formKey !== MASKED_KEY) return formKey;
  const s = arrService.getArrSettings();
  return (service === 'radarr' ? s.radarrApiKey : s.sonarrApiKey) ?? null;
}

/** Convert any error to a human readable message. */
export function describeArrError(err: unknown): string {
  if (err instanceof ArrApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Wrap an arr API call so {@link ArrApiError}s become TRPC INTERNAL_SERVER_ERRORs
 * and 'Sonarr not configured'/'Radarr not configured' become PRECONDITION_FAILED.
 */
export async function withArrErrorHandling<T>(service: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ArrApiError) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `${service} error: ${err.message}`,
      });
    }
    if (err instanceof Error && err.message === `${service} not configured`) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message });
    }
    throw err;
  }
}

/** Require a configured Radarr client, throwing PRECONDITION_FAILED otherwise. */
export function requireRadarrClient(): RadarrClient {
  const client = arrService.getRadarrClient();
  if (!client) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Radarr is not configured' });
  }
  return client;
}

/** Require a configured Sonarr client, throwing PRECONDITION_FAILED otherwise. */
export function requireSonarrClient(): SonarrClient {
  const client = arrService.getSonarrClient();
  if (!client) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Sonarr is not configured' });
  }
  return client;
}
