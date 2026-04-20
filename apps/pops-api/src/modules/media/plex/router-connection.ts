import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure } from '../../../trpc.js';
import { SETTINGS_KEYS } from '../../core/settings/keys.js';
import { PlexClient } from './client.js';
import { requirePlexClient } from './router-helpers.js';
import * as plexService from './service.js';
import { PlexApiError } from './types.js';

function normalizeUrl(input: string): string {
  let final = input.trim();
  if (!final.startsWith('http://') && !final.startsWith('https://')) {
    final = `http://${final}`;
  }
  try {
    new URL(final);
  } catch {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Invalid URL format. Please provide a valid address (e.g., http://192.168.1.100:32400)',
    });
  }
  return final;
}

async function probeReachability(url: string): Promise<void> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${url}/identity`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok && res.status !== 401) {
      throw new Error(`Server responded with ${res.status}`);
    }
  } finally {
    clearTimeout(id);
  }
}

async function validateConnection(url: string, token: string | undefined): Promise<void> {
  try {
    if (token) {
      console.warn(`[Plex] Validating full connection to ${url}...`);
      const testClient = new PlexClient(url, token);
      await testClient.getLibraries();
    } else {
      console.warn(`[Plex] Validating reachability for ${url}...`);
      await probeReachability(url);
    }
  } catch (err) {
    console.error(`[Plex] Connection validation failed for ${url}:`, err);
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Could not connect to Plex server at ${url}. Verify the address is correct and the server is reachable.`,
    });
  }
}

function lookupToken(): string | undefined {
  const db = getDrizzle();
  const tokenRecord = db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEYS.PLEX_TOKEN))
    .get();
  return tokenRecord?.value;
}

export const connectionProcedures = {
  testConnection: protectedProcedure.query(async () => {
    const client = requirePlexClient();
    try {
      const connected = await plexService.testConnection(client);
      return { data: { connected } };
    } catch (err) {
      if (err instanceof PlexApiError) {
        return { data: { connected: false, error: err.message } };
      }
      throw err;
    }
  }),

  getLibraries: protectedProcedure.query(async () => {
    const client = requirePlexClient();
    try {
      return { data: await client.getLibraries() };
    } catch (err) {
      if (err instanceof PlexApiError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Plex API error: ${err.message}`,
        });
      }
      throw err;
    }
  }),

  setUrl: protectedProcedure
    .input(z.object({ url: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const finalUrl = normalizeUrl(input.url);
      const token = lookupToken();
      await validateConnection(finalUrl, token);

      console.warn(`[Plex] Updating server URL to: ${finalUrl}`);
      const db = getDrizzle();
      db.insert(settings)
        .values({ key: SETTINGS_KEYS.PLEX_URL, value: finalUrl })
        .onConflictDoUpdate({ target: settings.key, set: { value: finalUrl } })
        .run();
      return { message: 'Plex URL updated and validated' };
    }),

  getPlexUrl: protectedProcedure.query(() => {
    return { data: plexService.getPlexUrl() };
  }),

  getPlexUsername: protectedProcedure.query(() => {
    return { data: plexService.getPlexUsername() };
  }),
};
