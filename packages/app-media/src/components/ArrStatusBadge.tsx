import { usePillarQuery } from '@pops/pillar-sdk/react';
/**
 * ArrStatusBadge — shows Radarr/Sonarr monitoring and download status.
 *
 * Hidden when the respective service is not configured.
 */
import { Badge } from '@pops/ui';

import { ARR_STATUS_STYLES } from '../lib/statusStyles';

type MediaKind = 'movie' | 'show';

interface ArrStatusBadgeProps {
  kind: MediaKind;
  /** TMDB ID for movies, TVDB ID for shows. */
  externalId: number;
}

interface ArrConfigResult {
  data: { radarrConfigured: boolean; sonarrConfigured: boolean };
}

type ArrStatus = keyof typeof ARR_STATUS_STYLES;

interface ArrStatusResult {
  data: { status: ArrStatus; label: string } | null;
}

function useArrStatus({ kind, externalId }: ArrStatusBadgeProps) {
  const { data: configData } = usePillarQuery<ArrConfigResult>(
    'media',
    ['arr', 'getConfig'],
    undefined
  );
  const config = configData?.data;
  const isConfigured = kind === 'movie' ? config?.radarrConfigured : config?.sonarrConfigured;

  const movieStatus = usePillarQuery<ArrStatusResult>(
    'media',
    ['arr', 'getMovieStatus'],
    { tmdbId: externalId },
    { enabled: kind === 'movie' && isConfigured === true }
  );
  const showStatus = usePillarQuery<ArrStatusResult>(
    'media',
    ['arr', 'getShowStatus'],
    { tvdbId: externalId },
    { enabled: kind === 'show' && isConfigured === true }
  );

  return { isConfigured, query: kind === 'movie' ? movieStatus : showStatus };
}

export function ArrStatusBadge({ kind, externalId }: ArrStatusBadgeProps) {
  const { isConfigured, query } = useArrStatus({ kind, externalId });

  if (!isConfigured) return null;
  if (query.isLoading) return null;

  if (query.error) {
    const unavailableLabel = kind === 'movie' ? 'Radarr unavailable' : 'Sonarr unavailable';
    return <Badge className="bg-muted text-muted-foreground">{unavailableLabel}</Badge>;
  }

  if (!query.data?.data) return null;

  const result = query.data.data;
  const colorClass = ARR_STATUS_STYLES[result.status] ?? ARR_STATUS_STYLES.not_found;

  return <Badge className={colorClass}>{result.label}</Badge>;
}
