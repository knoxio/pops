import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import { comparisonsBlacklistMovie, comparisonsListForMedia } from '../../media-api/index.js';

interface UseArenaBlacklistArgs {
  resolveTitle: (mediaId: number) => string;
  onAfterAction: () => void;
}

interface BlacklistInput {
  mediaType: 'movie';
  mediaId: number;
}

/**
 * Manages the "Mark as not watched" (blacklist) confirmation flow:
 * the target movie, comparison-count lookup, and the destructive mutation.
 */
export function useArenaBlacklist({ resolveTitle, onAfterAction }: UseArenaBlacklistArgs) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<{ id: number; title: string } | null>(null);

  const listForMediaInput = {
    mediaType: 'movie' as const,
    mediaId: target?.id ?? 0,
    limit: 1,
  };
  const { data: blacklistComparisonData } = useQuery({
    queryKey: ['media', 'comparisons', 'listForMedia', listForMediaInput],
    queryFn: async () => unwrap(await comparisonsListForMedia({ query: listForMediaInput })),
    enabled: target !== null,
  });
  const comparisonsToPurge = blacklistComparisonData?.pagination?.total ?? null;

  const blacklistMutation = useMutation({
    mutationFn: async (variables: BlacklistInput) =>
      unwrap(await comparisonsBlacklistMovie({ body: variables })),
    onSuccess: (_data, variables) => {
      toast.success(`${resolveTitle(variables.mediaId)} marked as not watched`);
      setTarget(null);
      onAfterAction();
      void queryClient.invalidateQueries({
        queryKey: ['media', 'comparisons', 'getSmartPair'],
      });
    },
  });

  const open = useCallback((movie: { id: number; title: string }) => {
    setTarget(movie);
  }, []);

  const cancel = useCallback(() => setTarget(null), []);

  const confirm = useCallback(() => {
    if (!target) return;
    blacklistMutation.mutate({ mediaType: 'movie', mediaId: target.id });
  }, [target, blacklistMutation]);

  return {
    target,
    comparisonsToPurge,
    isPending: blacklistMutation.isPending,
    open,
    cancel,
    confirm,
  };
}
