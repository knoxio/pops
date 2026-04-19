import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { useDebriefDestructiveActions } from './useDebriefDestructiveActions';
import { useDebriefWatchlist } from './useDebriefWatchlist';

import type { Debrief } from './types';

interface DebriefRecordVars {
  sessionId: number;
  dimensionId: number;
  opponentType: 'movie';
  opponentId: number;
  winnerId: number;
  drawTier?: 'high' | 'mid' | 'low';
}

function useRecordHandlers({
  debrief,
  currentDimension,
  recordMutation,
}: {
  debrief: Debrief | undefined;
  currentDimension: Debrief['dimensions'][number] | null;
  recordMutation: { mutate: (v: DebriefRecordVars) => void; isPending: boolean };
}) {
  const handlePick = useCallback(
    (winnerId: number) => {
      if (!currentDimension?.opponent || !debrief || recordMutation.isPending) return;
      recordMutation.mutate({
        sessionId: debrief.sessionId,
        dimensionId: currentDimension.dimensionId,
        opponentType: 'movie',
        opponentId: currentDimension.opponent.id,
        winnerId,
      });
    },
    [currentDimension, debrief, recordMutation]
  );

  const handleDraw = useCallback(
    (tier: 'high' | 'mid' | 'low') => {
      if (!currentDimension?.opponent || !debrief || recordMutation.isPending) return;
      recordMutation.mutate({
        sessionId: debrief.sessionId,
        dimensionId: currentDimension.dimensionId,
        opponentType: 'movie',
        opponentId: currentDimension.opponent.id,
        winnerId: 0,
        drawTier: tier,
      });
    },
    [currentDimension, debrief, recordMutation]
  );

  return { handlePick, handleDraw };
}

function useDebriefData(movieId: number) {
  const utils = trpc.useUtils();
  const {
    data: debriefData,
    isLoading,
    error,
    refetch,
  } = trpc.media.comparisons.getDebrief.useQuery(
    { mediaType: 'movie', mediaId: movieId },
    { enabled: !Number.isNaN(movieId) && movieId > 0 }
  );

  const debrief: Debrief | undefined = debriefData?.data;
  const pendingDimensions = debrief?.dimensions.filter((d) => d.status === 'pending') ?? [];
  const allComplete = debrief ? pendingDimensions.length === 0 : false;
  const currentDimension = pendingDimensions[0] ?? null;

  const recordMutation = trpc.media.comparisons.recordDebriefComparison.useMutation({
    onSuccess: (result) => {
      toast.success(result.data.sessionComplete ? 'Debrief complete!' : 'Comparison recorded');
      void utils.media.comparisons.getDebrief.invalidate({ mediaType: 'movie', mediaId: movieId });
      void utils.media.comparisons.getPendingDebriefs.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return {
    utils,
    isLoading,
    error,
    refetch,
    debrief,
    pendingDimensions,
    allComplete,
    currentDimension,
    recordMutation,
  };
}

export function useDebriefPageModel(movieId: number) {
  const navigate = useNavigate();
  const data = useDebriefData(movieId);
  const { utils, debrief, currentDimension, recordMutation } = data;

  const resolveTitle = useCallback(
    (id: number) => {
      if (id === debrief?.movie.mediaId) return debrief.movie.title;
      if (id === currentDimension?.opponent?.id) return currentDimension.opponent.title;
      return 'Movie';
    },
    [debrief, currentDimension]
  );

  const watchlist = useDebriefWatchlist({ enabled: !!debrief, resolveTitle });
  const destructive = useDebriefDestructiveActions({
    movieId,
    currentDimensionId: currentDimension?.dimensionId ?? null,
    resolveTitle,
  });

  const { handlePick, handleDraw } = useRecordHandlers({
    debrief,
    currentDimension,
    recordMutation,
  });

  const handleDimensionSkipped = useCallback(() => {
    void utils.media.comparisons.getDebrief.invalidate({ mediaType: 'movie', mediaId: movieId });
  }, [utils, movieId]);

  const handleDoAnother = useCallback(() => navigate('/media/compare'), [navigate]);

  return {
    isLoading: data.isLoading,
    error: data.error,
    refetch: data.refetch,
    debrief,
    pendingDimensions: data.pendingDimensions,
    allComplete: data.allComplete,
    currentDimension,
    recordMutation,
    watchlist,
    destructive,
    handlePick,
    handleDraw,
    handleDimensionSkipped,
    handleDoAnother,
  };
}
