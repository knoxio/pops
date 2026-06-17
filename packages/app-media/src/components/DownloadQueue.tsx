import { useQuery } from '@tanstack/react-query';

/**
 * DownloadQueue — shows active downloads from Radarr + Sonarr.
 *
 * Auto-refreshes every 30s. Hidden when nothing is downloading
 * or when neither service is configured.
 */
import { Badge } from '@pops/ui';

import { unwrap } from '../media-api-helpers.js';
import { arrConfig, arrQueue } from '../media-api/index.js';

interface ArrConfigResult {
  data: { radarrConfigured: boolean; sonarrConfigured: boolean };
}

interface DownloadQueueItem {
  id: string | number;
  mediaType: string;
  title: string;
  episodeLabel?: string;
  progress: number;
}

interface DownloadQueueResult {
  data: DownloadQueueItem[];
}

function DownloadRow({ item }: { item: DownloadQueueItem }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <Badge variant="outline" className="text-2xs uppercase shrink-0">
        {item.mediaType === 'movie' ? 'Movie' : 'Episode'}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {item.title}
          {item.episodeLabel && (
            <span className="text-muted-foreground ml-1.5">{item.episodeLabel}</span>
          )}
        </p>
        <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-app-accent transition-all duration-500"
            style={{ width: `${item.progress}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{item.progress}%</span>
    </div>
  );
}

export function DownloadQueue() {
  const { data: configData } = useQuery<ArrConfigResult>({
    queryKey: ['media', 'arr', 'getConfig'],
    queryFn: async () => unwrap(await arrConfig()),
  });
  const config = configData?.data;
  const hasAnyService = config?.radarrConfigured ?? config?.sonarrConfigured;

  const { data } = useQuery<DownloadQueueResult>({
    queryKey: ['media', 'arr', 'getDownloadQueue'],
    queryFn: async () => unwrap(await arrQueue()),
    enabled: hasAnyService === true,
    refetchInterval: 30_000,
  });

  const items = data?.data;
  if (!items || items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Downloading
      </h2>
      <div className="space-y-1.5">
        {items.map((item) => (
          <DownloadRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
