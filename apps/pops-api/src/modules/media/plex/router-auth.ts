import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { SettingNotFoundError, settingsService } from '@pops/core-db';

import { getCoreDrizzle } from '../../../db.js';
import { trpcError } from '../../../shared/trpc-error.js';
import { protectedProcedure } from '../../../trpc.js';
import { SETTINGS_KEYS } from '../../core/settings/keys.js';
import * as plexService from './service.js';

interface PlexPinResponse {
  authToken?: string | null;
  expiresAt?: string | null;
  username?: string | null;
}

function persistAuthSettings(authToken: string, username: string | null): void {
  const coreDb = getCoreDrizzle();
  console.warn(`[Plex] Encrypting and saving token to database...`);
  const encryptedToken = plexService.encryptToken(authToken);
  settingsService.setRawSetting(coreDb, SETTINGS_KEYS.PLEX_TOKEN, encryptedToken);
  if (username) {
    settingsService.setRawSetting(coreDb, SETTINGS_KEYS.PLEX_USERNAME, username);
  }
}

function deleteSettingIfExists(key: string): void {
  try {
    settingsService.deleteSetting(getCoreDrizzle(), key);
  } catch (err) {
    if (!(err instanceof SettingNotFoundError)) throw err;
  }
}

export const authProcedures = {
  getAuthPin: protectedProcedure.mutation(async () => {
    const clientId = plexService.getPlexClientId();
    const res = await fetch('https://plex.tv/api/v2/pins?strong=false', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-Plex-Product': 'POPS',
        'X-Plex-Client-Identifier': clientId,
      },
    });
    if (!res.ok) {
      throw trpcError(
        res.status === 429 ? 'TOO_MANY_REQUESTS' : 'INTERNAL_SERVER_ERROR',
        'media.plex.pinFailed',
        { status: String(res.status) }
      );
    }
    const data = (await res.json()) as { id: number; code: string };
    return { data: { id: data.id, code: data.code, clientId } };
  }),

  checkAuthPin: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const clientId = plexService.getPlexClientId();
      const res = await fetch(`https://plex.tv/api/v2/pins/${input.id}`, {
        headers: { Accept: 'application/json', 'X-Plex-Client-Identifier': clientId },
      });
      if (!res.ok) {
        if (res.status === 404) {
          throw trpcError('NOT_FOUND', 'media.plex.pinNotFound');
        }
        throw trpcError('INTERNAL_SERVER_ERROR', 'media.plex.pinCheckFailed', {
          status: String(res.status),
        });
      }

      const data = (await res.json()) as PlexPinResponse;
      if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) {
        return { data: { connected: false, expired: true } };
      }

      console.warn(
        `[Plex] PIN check response for ${input.id}:`,
        data.authToken ? 'Token received' : 'No token yet'
      );

      if (data.authToken) {
        persistAuthSettings(data.authToken, data.username ?? null);
        return { data: { connected: true, username: data.username ?? null } };
      }
      return { data: { connected: false, expired: false } };
    }),

  disconnect: protectedProcedure.mutation(() => {
    deleteSettingIfExists(SETTINGS_KEYS.PLEX_TOKEN);
    deleteSettingIfExists(SETTINGS_KEYS.PLEX_USERNAME);
    return { message: 'Disconnected from Plex' };
  }),
};

export { eq };
