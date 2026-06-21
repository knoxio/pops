import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import {
  arrConfig,
  arrGetMovieStatus,
  rotationAddToQueue,
  rotationGetCandidateStatus,
  rotationRemoveExclusion,
  rotationRemoveFromQueue,
} from '../../media-api/index.js';

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
  title: string;
  year?: number;
  posterPath?: string;
  rating?: number;
}

export function useRotationButtonsModel(tmdbId: number) {
  const queryClient = useQueryClient();

  const { data: configData } = useQuery<ArrConfigResult>({
    queryKey: ['media', 'arr', 'getConfig'],
    queryFn: async () => unwrap(await arrConfig()),
  });
  const radarrConfigured = configData?.data?.radarrConfigured === true;

  const movieStatus = useQuery<MovieStatusResult>({
    queryKey: ['media', 'arr', 'getMovieStatus', { tmdbId }],
    queryFn: async () => unwrap(await arrGetMovieStatus({ path: { tmdbId } })),
    enabled: radarrConfigured,
  });

  const { data: candidateData, isLoading: candidateLoading } = useQuery<CandidateStatusResult>({
    queryKey: ['media', 'rotation', 'getCandidateStatus', { tmdbId }],
    queryFn: async () =>
      (await unwrap(await rotationGetCandidateStatus({ path: { tmdbId } }))).data,
  });

  const invalidateRotation = () =>
    void queryClient.invalidateQueries({ queryKey: ['media', 'rotation'] });

  const addToQueueMutation = useMutation({
    mutationFn: async (input: AddToQueueInput) => unwrap(await rotationAddToQueue({ body: input })),
    onSuccess: () => {
      toast.success('Added to rotation queue');
      invalidateRotation();
    },
    onError: () => toast.error('Failed to add to queue'),
  });

  const removeFromQueueMutation = useMutation({
    mutationFn: async (input: { tmdbId: number }) =>
      unwrap(await rotationRemoveFromQueue({ path: { tmdbId: input.tmdbId } })),
    onSuccess: () => {
      toast.success('Removed from queue');
      invalidateRotation();
    },
    onError: () => toast.error('Failed to remove from queue'),
  });

  const removeExclusionMutation = useMutation({
    mutationFn: async (input: { tmdbId: number }) =>
      unwrap(await rotationRemoveExclusion({ path: { tmdbId: input.tmdbId } })),
    onSuccess: () => {
      toast.success('Exclusion removed');
      invalidateRotation();
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
