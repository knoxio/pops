import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { pillar } from '@pops/pillar-sdk/server';

import { trpcError } from '../../../shared/trpc-error.js';
import { protectedProcedure } from '../../../trpc.js';
import { SETTINGS_KEYS, type SettingsKey } from '../../core/settings/keys.js';
import * as plexService from './service.js';

interface PlexPinResponse {
  authToken?: string | null;
  expiresAt?: string | null;
  username?: string | null;
}

type CoreSettingsShape = {
  settings: {
    set: (input: { key: SettingsKey; value: string }) => {
      data: { key: string; value: string };
      message: string;
    };
    delete: (input: { key: SettingsKey }) => { message: string };
  };
};

function core(): ReturnType<typeof pillar<CoreSettingsShape>> {
  return pillar<CoreSettingsShape>('core');
}

function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const data = (err as { data?: { code?: string } }).data;
  return data?.code === 'NOT_FOUND';
}

async function persistAuthSettings(authToken: string, username: string | null): Promise<void> {
  console.warn(`[Plex] Encrypting and saving token to database...`);
  const encryptedToken = await plexService.encryptToken(authToken);
  await core().settings.set.orThrow({ key: SETTINGS_KEYS.PLEX_TOKEN, value: encryptedToken });
  if (username) {
    await core().settings.set.orThrow({ key: SETTINGS_KEYS.PLEX_USERNAME, value: username });
  }
}

async function deleteSettingIfExists(key: SettingsKey): Promise<void> {
  try {
    await core().settings.delete.orThrow({ key });
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }
}

export const authProcedures = {
  getAuthPin: protectedProcedure.mutation(async () => {
    const clientId = await plexService.getPlexClientId();
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
      const clientId = await plexService.getPlexClientId();
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
        await persistAuthSettings(data.authToken, data.username ?? null);
        return { data: { connected: true, username: data.username ?? null } };
      }
      return { data: { connected: false, expired: false } };
    }),

  disconnect: protectedProcedure.mutation(async () => {
    await deleteSettingIfExists(SETTINGS_KEYS.PLEX_TOKEN);
    await deleteSettingIfExists(SETTINGS_KEYS.PLEX_USERNAME);
    return { message: 'Disconnected from Plex' };
  }),
};

export { eq };
