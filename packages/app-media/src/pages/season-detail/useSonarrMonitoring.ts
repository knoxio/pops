import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery } from '@pops/pillar-sdk/react';

import { useEpisodeMonitoring } from './useEpisodeMonitoring';

interface SonarrSeries {
  exists: boolean;
  sonarrId?: number;
  seasons?: Array<{ seasonNumber: number; monitored: boolean }>;
}

interface CheckSeriesEnvelope {
  data?: SonarrSeries;
}

interface SonarrEpisodeItem {
  id: number;
  episodeNumber: number;
  monitored: boolean;
  hasFile: boolean;
}

interface GetSeriesEpisodesEnvelope {
  data: SonarrEpisodeItem[];
}

interface UpdateSeasonMonitoringInput {
  sonarrId: number;
  seasonNumber: number;
  monitored: boolean;
}

interface UseSonarrMonitoringArgs {
  tvdbId: number | undefined;
  seasonNum: number;
}

/**
 * Hook owning Sonarr (Arr) monitoring state for a single season.
 */
export function useSonarrMonitoring({ tvdbId, seasonNum }: UseSonarrMonitoringArgs) {
  const { data: sonarrData } = usePillarQuery<CheckSeriesEnvelope>(
    'media',
    ['arr', 'checkSeries'],
    { tvdbId: tvdbId ?? 0 },
    { enabled: !!tvdbId }
  );

  const sonarrSeries: SonarrSeries | undefined = sonarrData?.data;
  const sonarrSeasonData = sonarrSeries?.seasons?.find((s) => s.seasonNumber === seasonNum);
  const [seasonMonitored, setSeasonMonitored] = useState<boolean | null>(null);
  const effectiveMonitored = seasonMonitored ?? sonarrSeasonData?.monitored ?? false;

  const seasonMonitorMutation = usePillarMutation<UpdateSeasonMonitoringInput, unknown>(
    'media',
    ['arr', 'updateSeasonMonitoring'],
    {
      onError: (err) => {
        setSeasonMonitored((prev) => (prev != null ? !prev : null));
        toast.error(`Failed to update monitoring: ${err.message}`);
      },
    }
  );

  const sonarrId = sonarrSeries?.sonarrId;
  const { data: sonarrEpisodesData } = usePillarQuery<GetSeriesEpisodesEnvelope>(
    'media',
    ['arr', 'getSeriesEpisodes'],
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
