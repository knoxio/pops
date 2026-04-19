import { trpc } from '@pops/api-client';
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

export function ArrStatusBadge({ kind, externalId }: ArrStatusBadgeProps) {
  const { data: configData } = trpc.media.arr.getConfig.useQuery();
  const config = configData?.data;

  const isConfigured = kind === 'movie' ? config?.radarrConfigured : config?.sonarrConfigured;

  const movieStatus = trpc.media.arr.getMovieStatus.useQuery(
    { tmdbId: externalId },
    { enabled: kind === 'movie' && isConfigured === true }
  );

  const showStatus = trpc.media.arr.getShowStatus.useQuery(
    { tvdbId: externalId },
    { enabled: kind === 'show' && isConfigured === true }
  );

  if (!isConfigured) return null;

  const query = kind === 'movie' ? movieStatus : showStatus;
  if (query.isLoading) return null;

  // Show unavailable badge when service is unreachable
  if (query.error) {
    const unavailableLabel = kind === 'movie' ? 'Radarr unavailable' : 'Sonarr unavailable';
    return <Badge className="bg-muted text-muted-foreground">{unavailableLabel}</Badge>;
  }

  if (!query.data?.data) return null;

  const result = query.data.data;
  const colorClass = ARR_STATUS_STYLES[result.status] ?? ARR_STATUS_STYLES.not_found;

  return <Badge className={colorClass}>{result.label}</Badge>;
}
