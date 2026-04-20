export interface HistoryEntry {
  id: number;
  mediaType: string;
  mediaId: number;
  watchedAt: string;
  title: string | null;
  posterPath: string | null;
  posterUrl: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  showName: string | null;
  tvShowId: number | null;
}

export type MediaTypeFilter = 'all' | 'movie' | 'episode';

export const FILTER_OPTIONS: { value: MediaTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'episode', label: 'Episodes' },
];

export const PAGE_SIZE = 50;

export function formatWatchDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  });
}

export function getEmptyHistoryMessage(filter: MediaTypeFilter): string {
  if (filter === 'all') return 'No watch history yet. Start watching something!';
  if (filter === 'movie') return 'No movies in your history.';
  return 'No episodes in your history.';
}

export function getHistoryHref(entry: HistoryEntry): string {
  const isEpisode = entry.mediaType === 'episode';
  if (isEpisode && entry.tvShowId) {
    return `/media/tv/${entry.tvShowId}/season/${entry.seasonNumber}`;
  }
  if (isEpisode) return `/media`;
  return `/media/movies/${entry.mediaId}`;
}
