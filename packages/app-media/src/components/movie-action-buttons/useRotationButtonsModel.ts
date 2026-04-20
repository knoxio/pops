import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

export function useRotationButtonsModel(tmdbId: number) {
  const utils = trpc.useUtils();

  const { data: configData } = trpc.media.arr.getConfig.useQuery();
  const radarrConfigured = configData?.data?.radarrConfigured === true;

  const movieStatus = trpc.media.arr.getMovieStatus.useQuery(
    { tmdbId },
    { enabled: radarrConfigured }
  );

  const { data: candidateData, isLoading: candidateLoading } =
    trpc.media.rotation.getCandidateStatus.useQuery({ tmdbId });

  const addToQueueMutation = trpc.media.rotation.addToQueue.useMutation({
    onSuccess: () => {
      toast.success('Added to rotation queue');
      void utils.media.rotation.getCandidateStatus.invalidate({ tmdbId });
    },
    onError: () => toast.error('Failed to add to queue'),
  });

  const removeFromQueueMutation = trpc.media.rotation.removeFromQueue.useMutation({
    onSuccess: () => {
      toast.success('Removed from queue');
      void utils.media.rotation.getCandidateStatus.invalidate({ tmdbId });
    },
    onError: () => toast.error('Failed to remove from queue'),
  });

  const removeExclusionMutation = trpc.media.rotation.removeExclusion.useMutation({
    onSuccess: () => {
      toast.success('Exclusion removed');
      void utils.media.rotation.getCandidateStatus.invalidate({ tmdbId });
    },
    onError: () => toast.error('Failed to remove exclusion'),
  });

  return {
    radarrConfigured,
    movieStatus,
    candidateData,
    candidateLoading,
    addToQueueMutation,
    removeFromQueueMutation,
    removeExclusionMutation,
  };
}
