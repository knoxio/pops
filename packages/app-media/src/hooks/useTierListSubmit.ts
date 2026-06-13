/**
 * useTierListSubmit — mutation hook for submitting tier list placements.
 *
 * Wraps the submitTierList pillar mutation with cache invalidation
 * and title enrichment for the summary display.
 */
import { useCallback, useState } from 'react';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface TierPlacement {
  movieId: number;
  tier: Tier;
}

export interface ScoreChangeWithTitle {
  movieId: number;
  title: string;
  oldScore: number;
  newScore: number;
}

export interface TierListResult {
  comparisonsRecorded: number;
  scoreChanges: ScoreChangeWithTitle[];
}

interface UseTierListSubmitOptions {
  /** Map of movieId → title for enriching score changes */
  movieTitles: Map<number, string>;
  onSuccess?: (result: TierListResult) => void;
}

interface SubmitTierListInput {
  dimensionId: number;
  placements: TierPlacement[];
}

interface SubmitTierListResponse {
  data: {
    comparisonsRecorded: number;
    scoreChanges: Array<{
      movieId: number;
      oldScore: number;
      newScore: number;
    }>;
  };
}

export function useTierListSubmit({ movieTitles, onSuccess }: UseTierListSubmitOptions) {
  const [result, setResult] = useState<TierListResult | null>(null);
  const utils = usePillarUtils('media');

  const mutation = usePillarMutation<SubmitTierListInput, SubmitTierListResponse>(
    'media',
    ['comparisons', 'submitTierList'],
    {
      onSuccess: (response) => {
        const enriched: TierListResult = {
          comparisonsRecorded: response.data.comparisonsRecorded,
          scoreChanges: response.data.scoreChanges.map((sc) => ({
            ...sc,
            title: movieTitles.get(sc.movieId) ?? `Movie #${sc.movieId}`,
          })),
        };
        setResult(enriched);
        void utils.invalidate(['comparisons', 'getTierListMovies']);
        void utils.invalidate(['comparisons', 'listAll']);
        void utils.invalidate(['comparisons', 'scores']);
        onSuccess?.(enriched);
      },
    }
  );

  const submit = useCallback(
    (dimensionId: number, placements: TierPlacement[]) => {
      mutation.mutate({ dimensionId, placements });
    },
    [mutation]
  );

  const reset = useCallback(() => {
    setResult(null);
  }, []);

  return {
    submit,
    result,
    reset,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
