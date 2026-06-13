import { toast } from 'sonner';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

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
  const utils = usePillarUtils('media');
  const downloadMutation = usePillarMutation<DownloadInput, unknown>(
    'media',
    ['rotation', 'downloadCandidate'],
    {
      onSuccess: () => {
        toast.success(`Downloading "${candidate.title}"`);
        void utils.invalidate(['rotation', 'listCandidates']);
      },
      onError: (err) => toast.error(err.message || 'Failed to download'),
    }
  );
  const excludeMutation = usePillarMutation<ExcludeInput, unknown>(
    'media',
    ['rotation', 'excludeCandidate'],
    {
      onSuccess: () => {
        toast.success(`Excluded "${candidate.title}"`);
        void utils.invalidate(['rotation', 'listCandidates']);
        void utils.invalidate(['rotation', 'listExclusions']);
        setPopoverOpen(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to exclude'),
    }
  );
  const unexcludeMutation = usePillarMutation<UnexcludeInput, unknown>(
    'media',
    ['rotation', 'removeExclusion'],
    {
      onSuccess: () => {
        toast.success(`Restored "${candidate.title}" to queue`);
        void utils.invalidate(['rotation', 'listCandidates']);
        void utils.invalidate(['rotation', 'listExclusions']);
      },
      onError: (err) => toast.error(err.message || 'Failed to restore'),
    }
  );
  return { downloadMutation, excludeMutation, unexcludeMutation };
}
