import { z } from 'zod';

import { protectedProcedure } from '../../../trpc.js';
import { describeArrError, resolveArrApiKey } from './router-helpers.js';
import * as arrService from './service.js';
import { SonarrClient } from './sonarr-client.js';

const TestConnectionInput = z.object({
  url: z.string().min(1),
  apiKey: z.string().min(1),
});

async function testSonarrClient(
  url: string,
  apiKey: string,
  expectMismatchSuffix: string
): Promise<{
  data: {
    configured: boolean;
    connected: boolean;
    error?: string;
    version?: string;
    appName?: string;
  };
  message?: string;
}> {
  const client = new SonarrClient(url, apiKey);
  try {
    const status = await client.testConnection();
    if (status.appName && status.appName.toLowerCase() !== 'sonarr') {
      return {
        data: {
          configured: true,
          connected: false,
          error: `Expected Sonarr but connected to ${status.appName}${expectMismatchSuffix}`,
        },
      };
    }
    return {
      data: { configured: true, connected: true, ...status },
      message: 'Sonarr connection successful',
    };
  } catch (err) {
    return { data: { configured: true, connected: false, error: describeArrError(err) } };
  }
}

export const sonarrTestProcedures = {
  /** Test Sonarr connection using provided form values. */
  testSonarr: protectedProcedure.input(TestConnectionInput).mutation(async ({ input }) => {
    const apiKey = resolveArrApiKey(input.apiKey, 'sonarr');
    if (!apiKey) {
      return { data: { configured: false, connected: false, error: 'No API key provided' } };
    }
    return testSonarrClient(input.url, apiKey, ' — check the URL');
  }),

  /** Test Sonarr connection using saved settings (no input required). */
  testSonarrSaved: protectedProcedure.mutation(async () => {
    const s = arrService.getArrSettings();
    if (!s.sonarrUrl || !s.sonarrApiKey) {
      return {
        data: {
          configured: false,
          connected: false,
          error: 'Sonarr URL or API key not configured',
        },
      };
    }
    return testSonarrClient(s.sonarrUrl, s.sonarrApiKey, '');
  }),
};
