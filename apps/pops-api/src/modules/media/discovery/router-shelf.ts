import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { protectedProcedure } from '../../../trpc.js';
import { withTrpcInternalError } from './router-helpers.js';
import * as service from './service.js';
import { getRecentImpressions, recordImpressions } from './shelf/impressions.service.js';
import { getRegisteredShelves } from './shelf/registry.js';
import { assembleSession } from './shelf/session.service.js';

type SelectedShelf = ReturnType<typeof assembleSession>[number];

async function fetchShelfItems(shelf: SelectedShelf): Promise<{
  shelfId: string;
  title: string;
  subtitle: SelectedShelf['subtitle'];
  emoji: SelectedShelf['emoji'];
  pinned: SelectedShelf['pinned'];
  items: Awaited<ReturnType<SelectedShelf['query']>>;
  totalCount: number;
  hasMore: boolean;
}> {
  try {
    const items = await shelf.query({ limit: 10, offset: 0 });
    return {
      shelfId: shelf.shelfId,
      title: shelf.title,
      subtitle: shelf.subtitle,
      emoji: shelf.emoji,
      pinned: shelf.pinned,
      items,
      totalCount: items.length,
      hasMore: items.length >= 10,
    };
  } catch {
    return {
      shelfId: shelf.shelfId,
      title: shelf.title,
      subtitle: shelf.subtitle,
      emoji: shelf.emoji,
      pinned: shelf.pinned,
      items: [],
      totalCount: 0,
      hasMore: false,
    };
  }
}

function buildShelfResults(
  selectedShelves: ReturnType<typeof assembleSession>
): Promise<Awaited<ReturnType<typeof fetchShelfItems>>[]> {
  return Promise.all(selectedShelves.map(fetchShelfItems));
}

export const sessionAndShelfProcedures = {
  /**
   * Assemble a discover session: runs the full pipeline (generate → filter → score →
   * select → jitter → record impressions) and returns ordered shelves with the first
   * 10 items each pre-fetched in parallel.
   */
  assembleSession: protectedProcedure.query(async () => {
    return withTrpcInternalError('Unknown error assembling discover session', async () => {
      const profile = service.getPreferenceProfile();
      const impressions = getRecentImpressions(7);
      const selectedShelves = assembleSession(profile, impressions);
      const shelfResults = await buildShelfResults(selectedShelves);
      const nonEmpty = shelfResults.filter((s) =>
        s.pinned ? s.items.length >= 1 : s.items.length >= 3
      );
      recordImpressions(nonEmpty.map((s) => s.shelfId));
      return { shelves: nonEmpty };
    });
  }),

  /**
   * Get a page of items for a specific shelf instance.
   *
   * The shelfId uniquely identifies an instance: static shelves use their
   * definition id (e.g. "trending-tmdb"), template shelves append a colon and
   * seed key (e.g. "because-you-watched:42").
   *
   * Returns { items, hasMore, totalCount }. totalCount is null because shelf
   * queries do not expose a separate count method.
   */
  getShelfPage: protectedProcedure
    .input(
      z.object({
        shelfId: z.string().min(1),
        limit: z.number().int().positive().max(50).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const { shelfId, limit, offset } = input;
      const defId = shelfId.includes(':') ? (shelfId.split(':')[0] ?? shelfId) : shelfId;
      const definitions = getRegisteredShelves();
      const definition = definitions.find((d) => d.id === defId);
      if (!definition) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Unknown shelf: ${defId}` });
      }

      const profile = service.getPreferenceProfile();
      const instances = definition.generate(profile);
      const instance = instances.find((i) => i.shelfId === shelfId);
      if (!instance) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Shelf instance not found: ${shelfId}`,
        });
      }

      return withTrpcInternalError(`Error fetching shelf: ${shelfId}`, async () => {
        const items = await instance.query({ limit, offset });
        return {
          items,
          hasMore: items.length === limit,
          totalCount: null,
        };
      });
    }),
};
