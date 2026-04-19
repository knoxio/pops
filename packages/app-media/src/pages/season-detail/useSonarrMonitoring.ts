import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

interface SonarrEpisode {
  id: number;
  episodeNumber: number;
  monitored: boolean;
  hasFile: boolean;
}

interface SonarrSeries {
  exists: boolean;
  sonarrId?: number;
  seasons?: Array<{ seasonNumber: number; monitored: boolean }>;
}

interface UseSonarrMonitoringArgs {
  tvdbId: number | undefined;
  seasonNum: number;
}

/**
 * Hook owning Sonarr (Arr) monitoring state for a single season:
 * - season-level monitoring toggle (with optimistic rollback)
 * - per-episode monitoring with optimistic state + rollback
 * - batch monitor / unmonitor for the season
 */
export function useSonarrMonitoring({ tvdbId, seasonNum }: UseSonarrMonitoringArgs) {
  const utils = trpc.useUtils();

  const { data: sonarrData } = trpc.media.arr.checkSeries.useQuery(
    { tvdbId: tvdbId ?? 0 },
    { enabled: !!tvdbId }
  );

  const sonarrSeries: SonarrSeries | undefined = sonarrData?.data;
  const sonarrSeasonData = sonarrSeries?.seasons?.find((s) => s.seasonNumber === seasonNum);
  const [seasonMonitored, setSeasonMonitored] = useState<boolean | null>(null);
  const effectiveMonitored = seasonMonitored ?? sonarrSeasonData?.monitored ?? false;

  const seasonMonitorMutation = trpc.media.arr.updateSeasonMonitoring.useMutation({
    onError: (err: { message: string }) => {
      setSeasonMonitored((prev) => (prev != null ? !prev : null));
      toast.error(`Failed to update monitoring: ${err.message}`);
    },
  });

  const sonarrId = sonarrSeries?.sonarrId;
  const { data: sonarrEpisodesData } = trpc.media.arr.getSeriesEpisodes.useQuery(
    { sonarrId: sonarrId ?? 0, seasonNumber: seasonNum },
    { enabled: !!sonarrId }
  );

  const sonarrEpisodes: SonarrEpisode[] = sonarrEpisodesData?.data ?? [];

  const [optimisticEpMonitoring, setOptimisticEpMonitoring] = useState<Map<number, boolean>>(
    new Map()
  );
  const [pendingEpMonitoring, setPendingEpMonitoring] = useState<Set<number>>(new Set());

  const monitoredMap = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const ep of sonarrEpisodes) {
      m.set(ep.episodeNumber, optimisticEpMonitoring.get(ep.episodeNumber) ?? ep.monitored);
    }
    return m;
  }, [sonarrEpisodes, optimisticEpMonitoring]);

  const hasFileMap = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const ep of sonarrEpisodes) {
      m.set(ep.episodeNumber, ep.hasFile);
    }
    return m;
  }, [sonarrEpisodes]);

  const epNumToSonarrId = useMemo(() => {
    const m = new Map<number, number>();
    for (const ep of sonarrEpisodes) {
      m.set(ep.episodeNumber, ep.id);
    }
    return m;
  }, [sonarrEpisodes]);

  const episodeMonitorMutation = trpc.media.arr.updateEpisodeMonitoring.useMutation({
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
          if (affectedIds.has(ep.id)) {
            next.set(ep.episodeNumber, !variables.monitored);
          }
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
          if (affectedIds.has(ep.id)) {
            next.delete(ep.episodeNumber);
          }
        }
        return next;
      });
    },
  });

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
      for (const ep of sonarrEpisodes) {
        next.set(ep.episodeNumber, newMonitored);
      }
      return next;
    });
    setPendingEpMonitoring((prev) => {
      const next = new Set(prev);
      for (const ep of sonarrEpisodes) {
        next.add(ep.episodeNumber);
      }
      return next;
    });

    episodeMonitorMutation.mutate({ episodeIds: ids, monitored: newMonitored });
  }, [allEpisodesMonitored, sonarrEpisodes, episodeMonitorMutation]);

  const handleSeasonMonitorToggle = useCallback(
    (checked: boolean) => {
      if (sonarrId == null) return;
      setSeasonMonitored(checked);
      seasonMonitorMutation.mutate({ sonarrId, seasonNumber: seasonNum, monitored: checked });
    },
    [sonarrId, seasonMonitorMutation, seasonNum]
  );

  return {
    sonarrSeries,
    sonarrEpisodes,
    monitoredMap,
    hasFileMap,
    pendingEpMonitoring,
    handleToggleEpMonitored,
    allEpisodesMonitored,
    handleBatchMonitorToggle,
    seasonMonitorPending: seasonMonitorMutation.isPending,
    episodeMonitorPending: episodeMonitorMutation.isPending,
    effectiveMonitored,
    handleSeasonMonitorToggle,
  };
}
