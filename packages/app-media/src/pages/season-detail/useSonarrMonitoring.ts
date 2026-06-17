import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import {
  arrCheckSeries,
  arrGetSeriesEpisodes,
  arrUpdateSeasonMonitoring,
} from '../../media-api/index.js';
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
  const { data: sonarrData } = useQuery({
    queryKey: ['media', 'arr', 'checkSeries', { tvdbId: tvdbId ?? 0 }],
    queryFn: async (): Promise<CheckSeriesEnvelope> =>
      unwrap(await arrCheckSeries({ path: { tvdbId: tvdbId ?? 0 } })),
    enabled: !!tvdbId,
  });

  const sonarrSeries: SonarrSeries | undefined = sonarrData?.data;
  const sonarrSeasonData = sonarrSeries?.seasons?.find((s) => s.seasonNumber === seasonNum);
  const [seasonMonitored, setSeasonMonitored] = useState<boolean | null>(null);
  const effectiveMonitored = seasonMonitored ?? sonarrSeasonData?.monitored ?? false;

  const seasonMonitorMutation = useMutation({
    mutationFn: async (variables: UpdateSeasonMonitoringInput) =>
      unwrap(
        await arrUpdateSeasonMonitoring({
          path: { sonarrId: variables.sonarrId, seasonNumber: variables.seasonNumber },
          body: { monitored: variables.monitored },
        })
      ),
    onError: (err: Error) => {
      setSeasonMonitored((prev) => (prev != null ? !prev : null));
      toast.error(`Failed to update monitoring: ${err.message}`);
    },
  });

  const sonarrId = sonarrSeries?.sonarrId;
  const { data: sonarrEpisodesData } = useQuery({
    queryKey: [
      'media',
      'arr',
      'getSeriesEpisodes',
      { sonarrId: sonarrId ?? 0, seasonNumber: seasonNum },
    ],
    queryFn: async (): Promise<GetSeriesEpisodesEnvelope> =>
      unwrap(
        await arrGetSeriesEpisodes({
          path: { sonarrId: sonarrId ?? 0 },
          query: { seasonNumber: seasonNum },
        })
      ),
    enabled: !!sonarrId,
  });

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
