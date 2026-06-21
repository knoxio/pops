import type { MediaType, SortOption } from '../../hooks/useMediaLibrary';

export const TYPE_OPTIONS: { value: MediaType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
];

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'title', label: 'Title (A-Z)' },
  { value: 'dateAdded', label: 'Date Added' },
  { value: 'releaseDate', label: 'Release Date' },
  { value: 'rating', label: 'Rating' },
];

export const PAGE_SIZE_OPTIONS = [24, 48, 96] as const;

export function isValidMediaType(v: string | null): v is MediaType {
  return v === 'all' || v === 'movie' || v === 'tv';
}

export function isValidSort(v: string | null): v is SortOption {
  return v === 'title' || v === 'dateAdded' || v === 'releaseDate' || v === 'rating';
}
