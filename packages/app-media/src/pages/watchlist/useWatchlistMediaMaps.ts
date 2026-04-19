import { useCallback, useMemo } from 'react';

import type { MediaMeta, WatchlistEntry } from './types';

type MovieRow = {
  id: number;
  title: string;
  releaseDate: string | null;
  posterUrl: string | null;
  rotationStatus?: MediaMeta['rotationStatus'];
  rotationExpiresAt?: string | null;
};

type TvRow = {
  id: number;
  name: string;
  firstAirDate: string | null;
  posterUrl: string | null;
};

export function useWatchlistMediaMaps(
  moviesData: { data?: MovieRow[] } | undefined,
  tvShowsData: { data?: TvRow[] } | undefined
) {
  const movieMap = useMemo(
    () =>
      new Map<number, MediaMeta>(
        (moviesData?.data ?? []).map((m) => [
          m.id,
          {
            title: m.title,
            year: m.releaseDate ? new Date(m.releaseDate).getFullYear() : null,
            posterUrl: m.posterUrl,
            rotationStatus: m.rotationStatus,
            rotationExpiresAt: m.rotationExpiresAt,
          },
        ])
      ),
    [moviesData?.data]
  );

  const tvMap = useMemo(
    () =>
      new Map<number, MediaMeta>(
        (tvShowsData?.data ?? []).map((s) => [
          s.id,
          {
            title: s.name,
            year: s.firstAirDate ? new Date(s.firstAirDate).getFullYear() : null,
            posterUrl: s.posterUrl,
          },
        ])
      ),
    [tvShowsData?.data]
  );

  const getMetaForEntry = useCallback(
    (entry: WatchlistEntry) => {
      const mapMeta =
        entry.mediaType === 'movie' ? movieMap.get(entry.mediaId) : tvMap.get(entry.mediaId);
      if (mapMeta) return mapMeta;
      if (entry.title) {
        return {
          title: entry.title,
          posterUrl: entry.posterUrl ?? null,
          year: null,
        };
      }
      return;
    },
    [movieMap, tvMap]
  );

  return { getMetaForEntry };
}
