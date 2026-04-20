export const SOURCE_TYPE_LABELS: Record<string, string> = {
  plex_watchlist: 'Plex Watchlist',
  plex_friends: 'Plex Friends',
  tmdb_top_rated: 'TMDB Top Rated',
  letterboxd: 'Letterboxd',
  manual: 'Manual Queue',
};

export function sourceTypeLabel(type: string): string {
  return SOURCE_TYPE_LABELS[type] ?? type;
}

export function formatSyncDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString();
}

export interface Source {
  id: number;
  type: string;
  name: string;
  priority: number;
  enabled: number;
  config: string | null;
  lastSyncedAt: string | null;
  syncIntervalHours: number;
  candidateCount: number;
}

export interface SourceFormValues {
  id?: number;
  type: string;
  name: string;
  priority: number;
  enabled: boolean;
  config: Record<string, unknown>;
  syncIntervalHours: number;
}
