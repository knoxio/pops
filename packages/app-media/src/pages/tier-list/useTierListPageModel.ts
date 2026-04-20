import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { type Tier, type TierMovie } from '../../components/TierListBoard';
import { useTierListSubmit } from '../../hooks/useTierListSubmit';
import { useTierListMutations } from './useTierListMutations';

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

  const movies: TierMovie[] = useMemo(
    () =>
      (tierMoviesQuery.data?.data ?? []).map((m) => ({
        mediaType: 'movie' as const,
        mediaId: m.id,
        title: m.title,
        posterUrl: m.posterUrl,
        score: m.score,
        comparisonCount: m.comparisonCount,
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

export function useTierListPageModel() {
  const navigate = useNavigate();
  const data = useDimensionsAndMovies();
  const { effectiveDimension, movies, tierMoviesQuery } = data;

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
  };
}
