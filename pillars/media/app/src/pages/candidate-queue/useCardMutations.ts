import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import {
  rotationAddExclusion,
  rotationDownloadCandidate,
  rotationRemoveExclusion,
} from '../../media-api/index.js';

import type { Candidate } from './CandidateCard';

interface DownloadInput {
  candidateId: number;
}

interface ExcludeInput {
  tmdbId: number;
  title: string;
  reason?: string;
}

interface UnexcludeInput {
  tmdbId: number;
}

export function useCardMutations(candidate: Candidate, setPopoverOpen: (v: boolean) => void) {
  const queryClient = useQueryClient();

  const invalidateCandidates = () =>
    queryClient.invalidateQueries({ queryKey: ['media', 'rotation', 'listCandidates'] });
  const invalidateExclusions = () =>
    queryClient.invalidateQueries({ queryKey: ['media', 'rotation', 'listExclusions'] });

  const downloadMutation = useMutation({
    mutationFn: async (input: DownloadInput) =>
      unwrap(await rotationDownloadCandidate({ path: { candidateId: input.candidateId } })),
    onSuccess: () => {
      toast.success(`Downloading "${candidate.title}"`);
      void invalidateCandidates();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to download'),
  });

  const excludeMutation = useMutation({
    mutationFn: async (input: ExcludeInput) =>
      unwrap(await rotationAddExclusion({ body: { tmdbId: input.tmdbId, reason: input.reason } })),
    onSuccess: () => {
      toast.success(`Excluded "${candidate.title}"`);
      void invalidateCandidates();
      void invalidateExclusions();
      setPopoverOpen(false);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to exclude'),
  });

  const unexcludeMutation = useMutation({
    mutationFn: async (input: UnexcludeInput) =>
      unwrap(await rotationRemoveExclusion({ path: { tmdbId: input.tmdbId } })),
    onSuccess: () => {
      toast.success(`Restored "${candidate.title}" to queue`);
      void invalidateCandidates();
      void invalidateExclusions();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to restore'),
  });

  return { downloadMutation, excludeMutation, unexcludeMutation };
}
