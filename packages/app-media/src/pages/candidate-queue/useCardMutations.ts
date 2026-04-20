import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { Candidate } from './CandidateCard';

export function useCardMutations(candidate: Candidate, setPopoverOpen: (v: boolean) => void) {
  const utils = trpc.useUtils();
  const downloadMutation = trpc.media.rotation.downloadCandidate.useMutation({
    onSuccess: () => {
      toast.success(`Downloading "${candidate.title}"`);
      void utils.media.rotation.listCandidates.invalidate();
    },
    onError: (err) => toast.error(err.message || 'Failed to download'),
  });
  const excludeMutation = trpc.media.rotation.excludeCandidate.useMutation({
    onSuccess: () => {
      toast.success(`Excluded "${candidate.title}"`);
      void utils.media.rotation.listCandidates.invalidate();
      void utils.media.rotation.listExclusions.invalidate();
      setPopoverOpen(false);
    },
    onError: (err) => toast.error(err.message || 'Failed to exclude'),
  });
  const unexcludeMutation = trpc.media.rotation.removeExclusion.useMutation({
    onSuccess: () => {
      toast.success(`Restored "${candidate.title}" to queue`);
      void utils.media.rotation.listCandidates.invalidate();
      void utils.media.rotation.listExclusions.invalidate();
    },
    onError: (err) => toast.error(err.message || 'Failed to restore'),
  });
  return { downloadMutation, excludeMutation, unexcludeMutation };
}
