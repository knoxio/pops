import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { useEpisodeMonitoring } from './useEpisodeMonitoring';

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
 * Hook owning Sonarr (Arr) monitoring state for a single season.
 */
export function useSonarrMonitoring({ tvdbId, seasonNum }: UseSonarrMonitoringArgs) {
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

  const sonarrEpisodes = sonarrEpisodesData?.data ?? [];
  const monitoring = useEpisodeMonitoring(sonarrEpisodes);

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
    ...monitoring,
    seasonMonitorPending: seasonMonitorMutation.isPending,
    effectiveMonitored,
    handleSeasonMonitorToggle,
  };
}
