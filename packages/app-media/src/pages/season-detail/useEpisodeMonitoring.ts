import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

interface SonarrEpisode {
  id: number;
  episodeNumber: number;
  monitored: boolean;
  hasFile: boolean;
}

function useDerivedMaps(sonarrEpisodes: SonarrEpisode[], optimistic: Map<number, boolean>) {
  const monitoredMap = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const ep of sonarrEpisodes) {
      m.set(ep.episodeNumber, optimistic.get(ep.episodeNumber) ?? ep.monitored);
    }
    return m;
  }, [sonarrEpisodes, optimistic]);

  const hasFileMap = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const ep of sonarrEpisodes) m.set(ep.episodeNumber, ep.hasFile);
    return m;
  }, [sonarrEpisodes]);

  const epNumToSonarrId = useMemo(() => {
    const m = new Map<number, number>();
    for (const ep of sonarrEpisodes) m.set(ep.episodeNumber, ep.id);
    return m;
  }, [sonarrEpisodes]);

  return { monitoredMap, hasFileMap, epNumToSonarrId };
}

function useMonitorMutation(
  sonarrEpisodes: SonarrEpisode[],
  setOptimisticEpMonitoring: React.Dispatch<React.SetStateAction<Map<number, boolean>>>,
  setPendingEpMonitoring: React.Dispatch<React.SetStateAction<Set<number>>>
) {
  const utils = trpc.useUtils();
  return trpc.media.arr.updateEpisodeMonitoring.useMutation({
    onSuccess: () => {
      void utils.media.arr.getSeriesEpisodes.invalidate();
    },
    onError: (
      err: { message: string },
      variables: { episodeIds: number[]; monitored: boolean }
    ) => {
      setOptimisticEpMonitoring((prev) => {
        const next = new Map(prev);
        const affectedIds = new Set(variables.episodeIds);
        for (const ep of sonarrEpisodes) {
          if (affectedIds.has(ep.id)) next.set(ep.episodeNumber, !variables.monitored);
        }
        return next;
      });
      toast.error(`Failed to update monitoring: ${err.message}`);
    },
    onSettled: (_data: unknown, _err: unknown, variables: { episodeIds: number[] }) => {
      setPendingEpMonitoring((prev) => {
        const next = new Set(prev);
        const affectedIds = new Set(variables.episodeIds);
        for (const ep of sonarrEpisodes) {
          if (affectedIds.has(ep.id)) next.delete(ep.episodeNumber);
        }
        return next;
      });
    },
  });
}

export function useEpisodeMonitoring(sonarrEpisodes: SonarrEpisode[]) {
  const [optimisticEpMonitoring, setOptimisticEpMonitoring] = useState<Map<number, boolean>>(
    new Map()
  );
  const [pendingEpMonitoring, setPendingEpMonitoring] = useState<Set<number>>(new Set());

  const { monitoredMap, hasFileMap, epNumToSonarrId } = useDerivedMaps(
    sonarrEpisodes,
    optimisticEpMonitoring
  );

  const episodeMonitorMutation = useMonitorMutation(
    sonarrEpisodes,
    setOptimisticEpMonitoring,
    setPendingEpMonitoring
  );

  const handleToggleEpMonitored = useCallback(
    (episodeNumber: number, monitored: boolean) => {
      const sonarrEpId = epNumToSonarrId.get(episodeNumber);
      if (sonarrEpId == null) return;
      setOptimisticEpMonitoring((prev) => {
        const next = new Map(prev);
        next.set(episodeNumber, monitored);
        return next;
      });
      setPendingEpMonitoring((prev) => new Set(prev).add(episodeNumber));
      episodeMonitorMutation.mutate({ episodeIds: [sonarrEpId], monitored });
    },
    [episodeMonitorMutation, epNumToSonarrId]
  );

  const allEpisodesMonitored =
    sonarrEpisodes.length > 0 &&
    sonarrEpisodes.every((ep) => monitoredMap.get(ep.episodeNumber) ?? ep.monitored);

  const handleBatchMonitorToggle = useCallback(() => {
    const newMonitored = !allEpisodesMonitored;
    const ids = sonarrEpisodes.map((ep) => ep.id);
    if (ids.length === 0) return;
    setOptimisticEpMonitoring((prev) => {
      const next = new Map(prev);
      for (const ep of sonarrEpisodes) next.set(ep.episodeNumber, newMonitored);
      return next;
    });
    setPendingEpMonitoring((prev) => {
      const next = new Set(prev);
      for (const ep of sonarrEpisodes) next.add(ep.episodeNumber);
      return next;
    });
    episodeMonitorMutation.mutate({ episodeIds: ids, monitored: newMonitored });
  }, [allEpisodesMonitored, sonarrEpisodes, episodeMonitorMutation]);

  return {
    monitoredMap,
    hasFileMap,
    pendingEpMonitoring,
    handleToggleEpMonitored,
    allEpisodesMonitored,
    handleBatchMonitorToggle,
    episodeMonitorPending: episodeMonitorMutation.isPending,
  };
}
