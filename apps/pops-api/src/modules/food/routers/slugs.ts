import { z } from 'zod';

import { slugSearchService, type SlugMatch } from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { getFoodDrizzle } from '../../../db/food-handle.js';
import { protectedProcedure, router } from '../../../trpc.js';

const SLUG_KIND = z.enum(['ingredient', 'recipe', 'prep_state']);
type SlugKind = z.infer<typeof SLUG_KIND>;

const FOOD_DB_KINDS: ReadonlySet<SlugKind> = new Set(['prep_state']);
const LEGACY_DB_KINDS: ReadonlySet<SlugKind> = new Set(['ingredient', 'recipe']);

const ALL_KINDS: readonly SlugKind[] = ['ingredient', 'recipe', 'prep_state'];

interface SearchInput {
  query: string;
  kinds?: SlugKind[];
  limit?: number;
}

/**
 * Run `searchSlugs` against the two backing handles for the requested
 * kinds and merge.
 *
 * Theme 13 PR 4 split the `slug_registry` table across two pillar DBs:
 * `kind='prep_state'` rows now live in `food.db` (via `getFoodDrizzle()`),
 * while `kind in ('ingredient','recipe')` rows still live in the legacy
 * shared `pops.db` (via `getDrizzle()`). A single-DB query would return
 * stale/incomplete results once writes have diverged, so we partition
 * the requested kinds by storage and merge the two result sets.
 *
 * `limit` is applied to each underlying query and again to the merged
 * output — slightly over-fetching in the worst case (limit*2 rows
 * scanned) but never exceeding the caller's cap.
 */
function searchSlugsAcrossPillars(input: SearchInput): SlugMatch[] {
  const requestedKinds = input.kinds ?? ALL_KINDS;
  if (requestedKinds.length === 0) return [];

  const legacyKinds = requestedKinds.filter((k) => LEGACY_DB_KINDS.has(k));
  const foodKinds = requestedKinds.filter((k) => FOOD_DB_KINDS.has(k));

  const merged: SlugMatch[] = [];
  if (legacyKinds.length > 0) {
    merged.push(
      ...slugSearchService.searchSlugs(getDrizzle(), {
        query: input.query,
        kinds: legacyKinds,
        limit: input.limit,
      })
    );
  }
  if (foodKinds.length > 0) {
    merged.push(
      ...slugSearchService.searchSlugs(getFoodDrizzle(), {
        query: input.query,
        kinds: foodKinds,
        limit: input.limit,
      })
    );
  }

  if (input.limit !== undefined && merged.length > input.limit) {
    return merged.slice(0, input.limit);
  }
  return merged;
}

export const slugsRouter = router({
  search: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        kinds: z.array(SLUG_KIND).optional(),
        limit: z.number().int().positive().max(100).optional(),
      })
    )
    .query(({ input }) => ({
      items: searchSlugsAcrossPillars(input),
    })),
});
