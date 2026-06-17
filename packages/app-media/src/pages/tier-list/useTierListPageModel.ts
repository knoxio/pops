import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { type Tier, type TierMovie } from '../../components/TierListBoard';
import { useTierListSubmit } from '../../hooks/useTierListSubmit';
import { unwrap } from '../../media-api-helpers.js';
import {
  comparisonsCreateDimension,
  comparisonsGetTierListMovies,
  comparisonsListDimensions,
} from '../../media-api/index.js';
import { useTierListMutations } from './useTierListMutations';

interface CreateDimensionInput {
  name: string;
  description: string | null;
}

function useDimensionsAndMovies() {
  const [selectedDimension, setSelectedDimension] = useState<number | null>(null);

  const { data: dimensionsData, isLoading: dimsLoading } = useQuery({
    queryKey: ['media', 'comparisons', 'listDimensions'],
    queryFn: async () => unwrap(await comparisonsListDimensions()),
  });

  const activeDimensions = useMemo(
    () => (dimensionsData?.data ?? []).filter((d) => d.active),
    [dimensionsData?.data]
  );

  const effectiveDimension = selectedDimension ?? activeDimensions[0]?.id ?? null;

  const tierMoviesQuery = useQuery({
    queryKey: ['media', 'comparisons', 'getTierListMovies', { dimensionId: effectiveDimension }],
    queryFn: async () =>
      unwrap(
        await comparisonsGetTierListMovies({ path: { dimensionId: effectiveDimension ?? 0 } })
      ),
    enabled: effectiveDimension != null,
    staleTime: Infinity,
  });

  const movies: TierMovie[] = useMemo(
    () =>
      (tierMoviesQuery.data?.data ?? []).map((m) => ({
        mediaType: 'movie' as const,
        mediaId: m.id,
        title: m.title,
        posterUrl: m.posterUrl,
        score: m.score,
        comparisonCount: m.comparisonCount,
        tierOverride: (m.tierOverride as TierMovie['tierOverride']) ?? null,
      })),
    [tierMoviesQuery.data]
  );

  return {
    selectedDimension,
    setSelectedDimension,
    dimsLoading,
    activeDimensions,
    effectiveDimension,
    tierMoviesQuery,
    movies,
  };
}

/**
 * Wires the `createDimension` mutation, dialog open state, and post-create
 * book-keeping. On success: invalidate `listDimensions`, select the new
 * dimension, and close the dialog. Errors surface via toast.
 */
function useCreateDimension(args: {
  setSelectedDimension: (id: number) => void;
  setDialogOpen: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const createDimensionMutation = useMutation({
    mutationFn: async (input: { name: string; description: string | null; active: boolean }) =>
      unwrap(
        await comparisonsCreateDimension({
          body: { ...input, sortOrder: 0, weight: 1.0 },
        })
      ),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ['media', 'comparisons', 'listDimensions'],
      });
      const newId = result.data.id;
      args.setSelectedDimension(newId);
      args.setDialogOpen(false);
      toast.success('Dimension created');
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreateDimension = useCallback(
    (input: CreateDimensionInput) => {
      createDimensionMutation.mutate({
        name: input.name,
        description: input.description,
        active: true,
      });
    },
    [createDimensionMutation]
  );

  return { createDimensionMutation, handleCreateDimension };
}

export function useTierListPageModel() {
  const navigate = useNavigate();
  const data = useDimensionsAndMovies();
  const { effectiveDimension, movies, tierMoviesQuery } = data;
  const [dialogOpen, setDialogOpen] = useState(false);
  const { createDimensionMutation, handleCreateDimension } = useCreateDimension({
    setSelectedDimension: data.setSelectedDimension,
    setDialogOpen,
  });

  const movieTitles = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of movies) map.set(m.mediaId, m.title);
    return map;
  }, [movies]);

  const submitState = useTierListSubmit({
    movieTitles,
    onSuccess: () => toast.success('Tier list submitted!'),
  });

  const mutations = useTierListMutations({
    movies,
    effectiveDimension,
    refetch: tierMoviesQuery.refetch,
  });

  const handleDimensionChange = useCallback(
    (dimId: number) => {
      data.setSelectedDimension(dimId);
      submitState.reset();
    },
    [data, submitState]
  );

  const handleDoAnother = useCallback(() => submitState.reset(), [submitState]);
  const handleDone = useCallback(() => navigate('/media/rankings'), [navigate]);

  const handleSubmit = useCallback(
    (placements: Array<{ movieId: number; tier: Tier }>) => {
      if (effectiveDimension != null) submitState.submit(effectiveDimension, placements);
    },
    [effectiveDimension, submitState]
  );

  return {
    ...data,
    submitState,
    mutations,
    handleDimensionChange,
    handleDoAnother,
    handleDone,
    handleSubmit,
    dialogOpen,
    setDialogOpen,
    createDimensionMutation,
    handleCreateDimension,
  };
}
