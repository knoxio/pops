import { getArrSettings } from './config.js';
import { RadarrClient } from './radarr-client.js';
import { SonarrClient } from './sonarr-client.js';
/**
 * Connection tests for Radarr/Sonarr.
 *
 * `testRadarr`/`testSonarr` test creds supplied in the request body.
 * `testRadarrSaved`/`testSonarrSaved` test the ENV-configured creds (the
 * monolith tested the persisted settings; env is now the source of truth).
 */
import { ArrApiError } from './types.js';

import type { ArrTestResult } from './types.js';

/** Convert any error to a human readable message. */
function describeArrError(err: unknown): string {
  if (err instanceof ArrApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

type ArrService = 'radarr' | 'sonarr';

export interface TestOutcome {
  data: ArrTestResult;
  message?: string;
}

function makeClient(service: ArrService, url: string, apiKey: string): RadarrClient | SonarrClient {
  return service === 'radarr' ? new RadarrClient(url, apiKey) : new SonarrClient(url, apiKey);
}

async function testClient(
  service: ArrService,
  url: string,
  apiKey: string,
  expectMismatchSuffix: string
): Promise<TestOutcome> {
  const label = service === 'radarr' ? 'Radarr' : 'Sonarr';
  const client = makeClient(service, url, apiKey);
  try {
    const status = await client.testConnection();
    if (status.appName && status.appName.toLowerCase() !== service) {
      return {
        data: {
          configured: true,
          connected: false,
          error: `Expected ${label} but connected to ${status.appName}${expectMismatchSuffix}`,
        },
      };
    }
    return {
      data: { configured: true, connected: true, ...status },
      message: `${label} connection successful`,
    };
  } catch (err) {
    return { data: { configured: true, connected: false, error: describeArrError(err) } };
  }
}

/** Test Radarr using creds provided in the request body. */
export async function testRadarr(url: string, apiKey: string): Promise<TestOutcome> {
  return testClient('radarr', url, apiKey, ' — check the URL');
}

/** Test Sonarr using creds provided in the request body. */
export async function testSonarr(url: string, apiKey: string): Promise<TestOutcome> {
  return testClient('sonarr', url, apiKey, ' — check the URL');
}

/** Test the ENV-configured Radarr creds. */
export async function testRadarrSaved(): Promise<TestOutcome> {
  const s = getArrSettings();
  if (!s.radarrUrl || !s.radarrApiKey) {
    return {
      data: { configured: false, connected: false, error: 'Radarr URL or API key not configured' },
    };
  }
  return testClient('radarr', s.radarrUrl, s.radarrApiKey, '');
}

/** Test the ENV-configured Sonarr creds. */
export async function testSonarrSaved(): Promise<TestOutcome> {
  const s = getArrSettings();
  if (!s.sonarrUrl || !s.sonarrApiKey) {
    return {
      data: { configured: false, connected: false, error: 'Sonarr URL or API key not configured' },
    };
  }
  return testClient('sonarr', s.sonarrUrl, s.sonarrApiKey, '');
}
