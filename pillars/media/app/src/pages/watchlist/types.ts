import type { RotationMeta } from '../../lib/types';

export type WatchlistFilter = 'all' | 'movie' | 'tv_show';

export const FILTER_OPTIONS: { value: WatchlistFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv_show', label: 'TV Shows' },
];

export function parseTypeParam(param: string | null): WatchlistFilter {
  if (param === 'movie' || param === 'tv_show') return param;
  return 'all';
}

export interface WatchlistEntry {
  id: number;
  mediaType: string;
  mediaId: number;
  priority: number | null;
  notes: string | null;
  addedAt: string;
  title?: string | null;
  posterUrl?: string | null;
}

export interface MediaMeta extends RotationMeta {
  title: string;
  year: number | null;
  posterUrl: string | null;
}
