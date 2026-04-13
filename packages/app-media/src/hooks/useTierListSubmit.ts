/**
 * useTierListSubmit — mutation hook for submitting tier list placements.
 *
 * Wraps the submitTierList tRPC mutation with cache invalidation
 * and title enrichment for the summary display.
 */
import { useCallback, useState } from 'react';

import { trpc } from '../lib/trpc';

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

export function useTierListSubmit({ movieTitles, onSuccess }: UseTierListSubmitOptions) {
  const [result, setResult] = useState<TierListResult | null>(null);
  const utils = trpc.useUtils();

  const mutation = trpc.media.comparisons.submitTierList.useMutation({
    onSuccess: (response) => {
      const enriched: TierListResult = {
        comparisonsRecorded: response.data.comparisonsRecorded,
        scoreChanges: response.data.scoreChanges.map((sc) => ({
          ...sc,
          title: movieTitles.get(sc.movieId) ?? `Movie #${sc.movieId}`,
        })),
      };
      setResult(enriched);
      void utils.media.comparisons.getTierListMovies.invalidate();
      void utils.media.comparisons.listAll.invalidate();
      void utils.media.comparisons.scores.invalidate();
      onSuccess?.(enriched);
    },
  });

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
