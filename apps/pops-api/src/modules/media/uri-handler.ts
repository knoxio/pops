/**
 * Media URI handler (PRD-101 US-08, ADR-012).
 *
 * Owns `pops:media/movie/{id}` and `pops:media/tv-show/{id}`. Movies and
 * tv-shows use numeric primary keys, so the handler validates that the URI
 * id segment is a positive integer string before hitting the service layer.
 * A non-integer id is treated as `not-found` rather than `malformed` — the
 * URI grammar (ADR-012) accepts any non-empty lowercase string as the id;
 * the type-specific shape constraint is a per-handler concern.
 */
import { NotFoundError } from '../../shared/errors.js';
import { getMovie } from './movies/service.js';
import { getTvShow } from './tv-shows/tv-shows-base.js';

import type { UriHandlerDescriptor, UriResolution } from '@pops/types';

export const MEDIA_URI_TYPES = ['movie', 'tv-show'] as const;

function parsePositiveIntId(id: string): number | null {
  if (!/^\d+$/.test(id)) return null;
  const parsed = Number(id);
  // Reject values past MAX_SAFE_INTEGER — Number() rounds those and the
  // rounded value could resolve to a different record.
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

async function tryGet<TData>(get: () => TData | Promise<TData>): Promise<UriResolution<TData>> {
  try {
    return { kind: 'object', data: await get() };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { kind: 'not-found' };
    }
    throw error;
  }
}

export const mediaUriHandler: UriHandlerDescriptor = {
  types: MEDIA_URI_TYPES,
  resolve: async (type, id) => {
    const numericId = parsePositiveIntId(id);
    if (numericId === null) {
      return { kind: 'not-found' };
    }
    switch (type) {
      case 'movie':
        return tryGet(() => getMovie(numericId));
      case 'tv-show':
        return tryGet(() => getTvShow(numericId));
      default:
        return { kind: 'not-found' };
    }
  },
};
