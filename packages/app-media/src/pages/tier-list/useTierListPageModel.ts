import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import { type Tier, type TierMovie } from '../../components/TierListBoard';
import { useTierListSubmit } from '../../hooks/useTierListSubmit';
import { useTierListMutations } from './useTierListMutations';

interface CreateDimensionInput {
  name: string;
  description: string | null;
}

interface DimensionRow {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
}

interface ListDimensionsResponse {
  data: DimensionRow[];
}

interface TierMovieRow {
  id: number;
  title: string;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
  tierOverride: string | null;
}

interface TierListMoviesResponse {
  data: TierMovieRow[];
}

interface CreateDimensionResponse {
  data: { id: number };
}

function useDimensionsAndMovies() {
  const [selectedDimension, setSelectedDimension] = useState<number | null>(null);

  const { data: dimensionsData, isLoading: dimsLoading } = usePillarQuery<ListDimensionsResponse>(
    'media',
    ['comparisons', 'listDimensions'],
    undefined
  );

  const activeDimensions = useMemo(
    () => (dimensionsData?.data ?? []).filter((d) => d.active),
    [dimensionsData?.data]
  );

  const effectiveDimension = selectedDimension ?? activeDimensions[0]?.id ?? null;

  const tierMoviesQuery = usePillarQuery<TierListMoviesResponse>(
    'media',
    ['comparisons', 'getTierListMovies'],
    { dimensionId: effectiveDimension ?? 0 },
    { enabled: effectiveDimension != null, staleTime: Infinity }
  );

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

interface CreateDimensionMutationInput {
  name: string;
  description: string | null;
  active: boolean;
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
  const utils = usePillarUtils('media');
  const createDimensionMutation = usePillarMutation<
    CreateDimensionMutationInput,
    CreateDimensionResponse
  >('media', ['comparisons', 'createDimension'], {
    onSuccess: (result) => {
      void utils.invalidate(['comparisons', 'listDimensions']);
      const newId = result?.data?.id;
      if (typeof newId === 'number') args.setSelectedDimension(newId);
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
