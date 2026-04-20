import { z } from 'zod';

import { protectedProcedure } from '../../../trpc.js';
import { RadarrClient } from './radarr-client.js';
import { describeArrError, MASKED_KEY, resolveArrApiKey } from './router-helpers.js';
import * as arrService from './service.js';

const TestConnectionInput = z.object({
  url: z.string().min(1),
  apiKey: z.string().min(1),
});

const SaveSettingsInput = z.object({
  radarrUrl: z.string().optional(),
  radarrApiKey: z.string().optional(),
  sonarrUrl: z.string().optional(),
  sonarrApiKey: z.string().optional(),
});

function buildSaveConfig(
  input: z.infer<typeof SaveSettingsInput>
): Parameters<typeof arrService.saveArrSettings>[0] {
  const config: Parameters<typeof arrService.saveArrSettings>[0] = {};
  if (input.radarrUrl !== undefined) config.radarrUrl = input.radarrUrl;
  if (input.radarrApiKey !== undefined && input.radarrApiKey !== MASKED_KEY) {
    config.radarrApiKey = input.radarrApiKey;
  }
  if (input.sonarrUrl !== undefined) config.sonarrUrl = input.sonarrUrl;
  if (input.sonarrApiKey !== undefined && input.sonarrApiKey !== MASKED_KEY) {
    config.sonarrApiKey = input.sonarrApiKey;
  }
  return config;
}

async function testRadarrClient(
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
  const client = new RadarrClient(url, apiKey);
  try {
    const status = await client.testConnection();
    if (status.appName && status.appName.toLowerCase() !== 'radarr') {
      return {
        data: {
          configured: true,
          connected: false,
          error: `Expected Radarr but connected to ${status.appName}${expectMismatchSuffix}`,
        },
      };
    }
    return {
      data: { configured: true, connected: true, ...status },
      message: 'Radarr connection successful',
    };
  } catch (err) {
    return { data: { configured: true, connected: false, error: describeArrError(err) } };
  }
}

export const radarrSettingsProcedures = {
  /** Get configuration state for both services. */
  getConfig: protectedProcedure.query(() => {
    return { data: arrService.getArrConfig() };
  }),

  /** Get current Arr settings (URLs and whether API keys are set). */
  getSettings: protectedProcedure.query(() => {
    const s = arrService.getArrSettings();
    return {
      data: {
        radarrUrl: s.radarrUrl ?? '',
        radarrApiKey: s.radarrApiKey ? MASKED_KEY : '',
        sonarrUrl: s.sonarrUrl ?? '',
        sonarrApiKey: s.sonarrApiKey ? MASKED_KEY : '',
        radarrHasKey: !!s.radarrApiKey,
        sonarrHasKey: !!s.sonarrApiKey,
      },
    };
  }),

  /** Save Arr settings (URLs and API keys). */
  saveSettings: protectedProcedure.input(SaveSettingsInput).mutation(({ input }) => {
    const config = buildSaveConfig(input);
    arrService.saveArrSettings(config);
    arrService.clearStatusCache();
    return { message: 'Arr settings saved' };
  }),

  /** Test Radarr connection using provided form values. */
  testRadarr: protectedProcedure.input(TestConnectionInput).mutation(async ({ input }) => {
    const apiKey = resolveArrApiKey(input.apiKey, 'radarr');
    if (!apiKey) {
      return { data: { configured: false, connected: false, error: 'No API key provided' } };
    }
    return testRadarrClient(input.url, apiKey, ' — check the URL');
  }),

  /** Test Radarr connection using saved settings (no input required). */
  testRadarrSaved: protectedProcedure.mutation(async () => {
    const s = arrService.getArrSettings();
    if (!s.radarrUrl || !s.radarrApiKey) {
      return {
        data: {
          configured: false,
          connected: false,
          error: 'Radarr URL or API key not configured',
        },
      };
    }
    return testRadarrClient(s.radarrUrl, s.radarrApiKey, '');
  }),
};
