import { getRadarrClient, getSonarrClient } from './service-settings.js';

import type { RadarrQueueRecord } from './types-radarr.js';
import type { SonarrQueueRecord } from './types-sonarr.js';
import type { DownloadQueueItem } from './types.js';

const QUEUE_CACHE_TTL_MS = 30 * 1000;

interface QueueCacheEntry {
  items: DownloadQueueItem[];
  expiresAt: number;
}

let queueCache: QueueCacheEntry | null = null;

function calcProgress(size: number, sizeleft: number): number {
  return size > 0 ? Math.round(((size - sizeleft) / size) * 100) : 0;
}

function mapRadarrRecord(record: RadarrQueueRecord): DownloadQueueItem {
  return {
    id: `radarr-${record.id}`,
    title: record.title,
    mediaType: 'movie',
    progress: calcProgress(record.size, record.sizeleft),
    source: 'radarr',
  };
}

function formatEpisodeLabel(episode: SonarrQueueRecord['episode']): string | undefined {
  if (!episode) return undefined;
  return `S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`;
}

function mapSonarrRecord(record: SonarrQueueRecord): DownloadQueueItem {
  return {
    id: `sonarr-${record.id}`,
    title: record.title,
    mediaType: 'episode',
    episodeLabel: formatEpisodeLabel(record.episode),
    progress: calcProgress(record.size, record.sizeleft),
    source: 'sonarr',
  };
}

/** Get combined download queue from Radarr + Sonarr with 30s cache. */
export async function getDownloadQueue(): Promise<DownloadQueueItem[]> {
  if (queueCache && queueCache.expiresAt > Date.now()) {
    return queueCache.items;
  }

  const radarrClient = getRadarrClient();
  const sonarrClient = getSonarrClient();

  const [radarrQueue, sonarrQueue] = await Promise.all([
    radarrClient ? radarrClient.getQueue().catch(() => null) : null,
    sonarrClient ? sonarrClient.getQueue().catch(() => null) : null,
  ]);

  const items: DownloadQueueItem[] = [];
  if (radarrQueue) items.push(...radarrQueue.records.map(mapRadarrRecord));
  if (sonarrQueue) items.push(...sonarrQueue.records.map(mapSonarrRecord));

  queueCache = { items, expiresAt: Date.now() + QUEUE_CACHE_TTL_MS };
  return items;
}

/** Reset the in-memory download queue cache. */
export function clearQueueCache(): void {
  queueCache = null;
}
