/**
 * The `assembleSession` + `getShelfPage` orchestration.
 *
 * `assembleSession` runs the pipeline (generate → score/select → fetch first
 * page of each shelf in parallel → drop too-thin shelves → record impressions)
 * and returns ordered shelves with their first items. `getShelfPage` resolves a
 * single instance by id and pages it.
 *
 * Ported from the monolith `router-shelf.ts`.
 */
import { discoveryService, shelfImpressionsService } from '../../../db/index.js';
import { NotFoundError } from '../../shared/errors.js';
import { type DiscoveryDeps } from './deps.js';
import { assembleSession, resolveShelfInstance } from './shelf/session.js';

import type { DiscoverResult } from '../../../db/index.js';
import type { ShelfInstance } from './shelf/types.js';

const FIRST_PAGE_SIZE = 10;
const IMPRESSION_WINDOW_DAYS = 7;
const PINNED_MIN_ITEMS = 1;
const NORMAL_MIN_ITEMS = 3;

export interface AssembledShelf {
  shelfId: string;
  title: string;
  subtitle: string | null;
  emoji: string | null;
  pinned: boolean;
  items: DiscoverResult[];
  totalCount: number;
  hasMore: boolean;
}

export interface AssembleSessionResult {
  shelves: AssembledShelf[];
}

async function fetchShelfItems(shelf: ShelfInstance): Promise<AssembledShelf> {
  const base = {
    shelfId: shelf.shelfId,
    title: shelf.title,
    subtitle: shelf.subtitle ?? null,
    emoji: shelf.emoji ?? null,
    pinned: shelf.pinned ?? false,
  };
  try {
    const items = await shelf.query({ limit: FIRST_PAGE_SIZE, offset: 0 });
    return { ...base, items, totalCount: items.length, hasMore: items.length >= FIRST_PAGE_SIZE };
  } catch {
    return { ...base, items: [], totalCount: 0, hasMore: false };
  }
}

/** Assemble a full discover session and record the surfaced-shelf impressions. */
export async function runAssembleSession(deps: DiscoveryDeps): Promise<AssembleSessionResult> {
  const profile = discoveryService.getPreferenceProfile(deps.db);
  const impressions = shelfImpressionsService.getRecentImpressions(deps.db, IMPRESSION_WINDOW_DAYS);
  const selected = assembleSession(deps, profile, impressions);
  const shelfResults = await Promise.all(selected.map(fetchShelfItems));
  const nonEmpty = shelfResults.filter((s) =>
    s.pinned ? s.items.length >= PINNED_MIN_ITEMS : s.items.length >= NORMAL_MIN_ITEMS
  );
  shelfImpressionsService.recordImpressions(
    deps.db,
    nonEmpty.map((s) => s.shelfId)
  );
  return { shelves: nonEmpty };
}

export interface ShelfPageResult {
  items: DiscoverResult[];
  hasMore: boolean;
  totalCount: number | null;
}

/** Page a single shelf instance. Throws NotFoundError for an unknown shelf id. */
export async function runGetShelfPage(
  deps: DiscoveryDeps,
  shelfId: string,
  limit: number,
  offset: number
): Promise<ShelfPageResult> {
  const profile = discoveryService.getPreferenceProfile(deps.db);
  const instance = resolveShelfInstance(deps, profile, shelfId);
  if (!instance) throw new NotFoundError('Shelf', shelfId);
  const items = await instance.query({ limit, offset });
  return { items, hasMore: items.length === limit, totalCount: null };
}
