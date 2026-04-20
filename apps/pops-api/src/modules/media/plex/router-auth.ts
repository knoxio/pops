import { TRPCError } from '@trpc/server';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure } from '../../../trpc.js';
import { SETTINGS_KEYS } from '../../core/settings/keys.js';
import * as plexService from './service.js';

interface PlexPinResponse {
  authToken?: string | null;
  expiresAt?: string | null;
  username?: string | null;
}

function persistAuthSettings(authToken: string, username: string | null): void {
  const db = getDrizzle();
  console.warn(`[Plex] Encrypting and saving token to database...`);
  const encryptedToken = plexService.encryptToken(authToken);
  db.insert(settings)
    .values({ key: SETTINGS_KEYS.PLEX_TOKEN, value: encryptedToken })
    .onConflictDoUpdate({ target: settings.key, set: { value: encryptedToken } })
    .run();
  if (username) {
    db.insert(settings)
      .values({ key: SETTINGS_KEYS.PLEX_USERNAME, value: username })
      .onConflictDoUpdate({ target: settings.key, set: { value: username } })
      .run();
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
      throw new TRPCError({
        code: res.status === 429 ? 'TOO_MANY_REQUESTS' : 'INTERNAL_SERVER_ERROR',
        message: `Failed to get Plex PIN (HTTP ${res.status})`,
      });
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
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid or expired PIN ID' });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to check Plex PIN (HTTP ${res.status})`,
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
    const db = getDrizzle();
    db.delete(settings)
      .where(inArray(settings.key, [SETTINGS_KEYS.PLEX_TOKEN, SETTINGS_KEYS.PLEX_USERNAME]))
      .run();
    return { message: 'Disconnected from Plex' };
  }),
};

export { eq };
