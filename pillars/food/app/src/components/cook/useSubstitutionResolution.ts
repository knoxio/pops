/**
 * PRD-149 — hook wrapping `food.substitutions.resolveForLine`.
 *
 * Wires the cook-modal picker's Substitutions section to the new tRPC
 * query owned by Epic 06. Returns the resolved candidates plus the
 * loading / error state the picker uses to gate rendering.
 *
 * The query keys on `(recipeVersionId, lineIndex)` so opening the picker
 * for a different line re-fetches automatically. Stale data is fine for
 * the modal session — the cook mutation re-validates the chosen edge at
 * submit time and returns `SubstitutionEdgeInvalid` if it's gone.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../../food-api-helpers.js';
import { substitutionsResolveForLine } from '../../food-api/index.js';
import { rankSubstitutionCandidates, type RankableCandidate } from './substitution-ranking.js';

import type { SubstitutionsResolveForLineResponses } from '../../food-api/types.gen.js';

type SubResolution = SubstitutionsResolveForLineResponses[200];

export type SubCandidate = SubResolution['candidates'][number];
export type SubCandidateBatch = SubCandidate['batches'][number];

export interface UseSubstitutionResolutionArgs {
  recipeVersionId: number;
  lineIndex: number;
  enabled: boolean;
  recipeContextTags?: readonly string[];
}

export interface UseSubstitutionResolutionResult {
  resolution: SubResolution | undefined;
  rankedCandidates: readonly SubCandidate[];
  isLoading: boolean;
  isError: boolean;
}

export function useSubstitutionResolution(
  args: UseSubstitutionResolutionArgs
): UseSubstitutionResolutionResult {
  const resolveInput = { recipeVersionId: args.recipeVersionId, lineIndex: args.lineIndex };
  const query = useQuery({
    queryKey: ['food', 'substitutions', 'resolveForLine', resolveInput],
    queryFn: async () => unwrap(await substitutionsResolveForLine({ query: resolveInput })),
    enabled: args.enabled,
  });
  const resolution = query.data;
  // Stable JSON key for the contextTags array so useMemo's dep array
  // doesn't see a fresh reference on every render (callers often spread
  // the recipe's tags inline). Mirrors the pattern used by
  // useCookResolution for shortfall keys.
  const contextTagsKey = JSON.stringify(
    args.recipeContextTags ?? resolution?.recipeContextTags ?? []
  );
  const rankedCandidates = useMemo<readonly SubCandidate[]>(() => {
    if (resolution === undefined) return [];
    const contextTags = JSON.parse(contextTagsKey) as readonly string[];
    const rankable = resolution.candidates.map(
      (c): RankableCandidate => ({
        ratio: c.ratio,
        contextTags: c.contextTags,
        ingredientName: c.substituteIngredientName,
        earliestExpiry: earliestExpiry(c.batches),
      })
    );
    const order = rankSubstitutionCandidates(rankable, contextTags);
    return order.map((i) => resolution.candidates[i] as SubCandidate);
  }, [resolution, contextTagsKey]);
  return {
    resolution,
    rankedCandidates,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

function earliestExpiry(batches: readonly SubCandidateBatch[]): string | null {
  let earliest: string | null = null;
  for (const b of batches) {
    if (b.expiresAt === null) continue;
    if (earliest === null || b.expiresAt.localeCompare(earliest) < 0) {
      earliest = b.expiresAt;
    }
  }
  return earliest;
}
