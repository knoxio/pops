import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { TIERS } from '../../components/tier-list-board/types';
import { type Tier, type TierMovie, type TierPlacements } from '../../components/TierListBoard';
import { useTierListSubmit } from '../../hooks/useTierListSubmit';
import { useTierListMutations } from './useTierListMutations';

interface TierPlacementResponse {
  mediaId: number;
  mediaType: 'movie';
  tier: string;
  title: string;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
}

function buildInitialPlacements(rows: TierPlacementResponse[]): TierPlacements {
  const placements: TierPlacements = { S: [], A: [], B: [], C: [], D: [] };
  for (const row of rows) {
    if (TIERS.includes(row.tier as Tier)) {
      placements[row.tier as Tier].push(row.mediaId);
    }
  }
  return placements;
}

interface CreateDimensionInput {
  name: string;
  description: string | null;
}

/**
 * Merge placed movies with the unranked pool. A movie can be in both sets
 * when the next round picked it again before it was placed; dedupe by
 * mediaId, preferring the placed copy so we keep its persisted score.
 */
function mergeMovieLists(placed: TierMovie[], unranked: TierMovie[]): TierMovie[] {
  const seen = new Set<number>();
  const merged: TierMovie[] = [];
  for (const m of [...placed, ...unranked]) {
    if (!seen.has(m.mediaId)) {
      merged.push(m);
      seen.add(m.mediaId);
    }
  }
  return merged;
}

function useDimensionsAndMovies() {
  const [selectedDimension, setSelectedDimension] = useState<number | null>(null);

  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const activeDimensions = useMemo(
    () => (dimensionsData?.data ?? []).filter((d: { active: boolean }) => d.active),
    [dimensionsData?.data]
  );

  const effectiveDimension = selectedDimension ?? activeDimensions[0]?.id ?? null;

  const tierMoviesQuery = trpc.media.comparisons.getTierListMovies.useQuery(
    { dimensionId: effectiveDimension ?? 0 },
    { enabled: effectiveDimension != null, staleTime: Infinity }
  );

  const placementsQuery = trpc.media.comparisons.getTierListPlacements.useQuery(
    { dimensionId: effectiveDimension ?? 0 },
    { enabled: effectiveDimension != null, staleTime: Infinity }
  );

  const placedMovies: TierMovie[] = useMemo(
    () =>
      (placementsQuery.data?.data ?? []).map((p: TierPlacementResponse) => ({
        mediaType: p.mediaType,
        mediaId: p.mediaId,
        title: p.title,
        posterUrl: p.posterUrl,
        score: p.score,
        comparisonCount: p.comparisonCount,
      })),
    [placementsQuery.data]
  );

  const movies: TierMovie[] = useMemo(() => {
    const unranked = (tierMoviesQuery.data?.data ?? []).map((m) => ({
      mediaType: 'movie' as const,
      mediaId: m.id,
      title: m.title,
      posterUrl: m.posterUrl,
      score: m.score,
      comparisonCount: m.comparisonCount,
    }));
    return mergeMovieLists(placedMovies, unranked);
  }, [placedMovies, tierMoviesQuery.data]);

  const initialPlacements = useMemo(
    () => buildInitialPlacements((placementsQuery.data?.data ?? []) as TierPlacementResponse[]),
    [placementsQuery.data]
  );

  return {
    selectedDimension,
    setSelectedDimension,
    dimsLoading,
    activeDimensions,
    effectiveDimension,
    tierMoviesQuery,
    placementsQuery,
    movies,
    initialPlacements,
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
  const utils = trpc.useUtils();
  const createDimensionMutation = trpc.media.comparisons.createDimension.useMutation({
    onSuccess: (result) => {
      void utils.media.comparisons.listDimensions.invalidate();
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
