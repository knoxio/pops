import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery } from '@pops/pillar-sdk/react';

interface ArrConfigResult {
  data: { radarrConfigured: boolean; sonarrConfigured: boolean };
}

interface MovieStatusResult {
  data: { status: string; label: string } | null;
}

interface CandidateStatusResult {
  inQueue?: boolean;
  isExcluded?: boolean;
}

interface AddToQueueInput {
  tmdbId: number;
  title?: string;
  year?: number;
  posterPath?: string;
  rating?: number;
}

export function useRotationButtonsModel(tmdbId: number) {
  const { data: configData } = usePillarQuery<ArrConfigResult>(
    'media',
    ['arr', 'getConfig'],
    undefined
  );
  const radarrConfigured = configData?.data?.radarrConfigured === true;

  const movieStatus = usePillarQuery<MovieStatusResult>(
    'media',
    ['arr', 'getMovieStatus'],
    { tmdbId },
    { enabled: radarrConfigured }
  );

  const { data: candidateData, isLoading: candidateLoading } =
    usePillarQuery<CandidateStatusResult>('media', ['rotation', 'getCandidateStatus'], { tmdbId });

  const addToQueueMutation = usePillarMutation<AddToQueueInput, unknown>(
    'media',
    ['rotation', 'addToQueue'],
    {
      onSuccess: () => toast.success('Added to rotation queue'),
      onError: () => toast.error('Failed to add to queue'),
    }
  );

  const removeFromQueueMutation = usePillarMutation<{ tmdbId: number }, unknown>(
    'media',
    ['rotation', 'removeFromQueue'],
    {
      onSuccess: () => toast.success('Removed from queue'),
      onError: () => toast.error('Failed to remove from queue'),
    }
  );

  const removeExclusionMutation = usePillarMutation<{ tmdbId: number }, unknown>(
    'media',
    ['rotation', 'removeExclusion'],
    {
      onSuccess: () => toast.success('Exclusion removed'),
      onError: () => toast.error('Failed to remove exclusion'),
    }
  );

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
