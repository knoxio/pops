import { useCallback, useState } from 'react';

export function useSearchAddState() {
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingToWatchlistIds, setAddingToWatchlistIds] = useState<Set<number>>(new Set());
  const [markingWatchedTmdbIds, setMarkingWatchedTmdbIds] = useState<Set<number>>(new Set());
  const [markingWatchedMediaIds, setMarkingWatchedMediaIds] = useState<Set<number>>(new Set());
  const [sessionMovieLocalIds, setSessionMovieLocalIds] = useState<Map<number, number>>(new Map());
  const [sessionTvLocalIds, setSessionTvLocalIds] = useState<Map<number, number>>(new Map());

  const removeAdding = useCallback((key: string) => {
    setAddingIds((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const removeFromSet = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) => {
      setter((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    []
  );

  return {
    addingIds,
    setAddingIds,
    addedIds,
    setAddedIds,
    addingToWatchlistIds,
    setAddingToWatchlistIds,
    markingWatchedTmdbIds,
    setMarkingWatchedTmdbIds,
    markingWatchedMediaIds,
    setMarkingWatchedMediaIds,
    sessionMovieLocalIds,
    setSessionMovieLocalIds,
    sessionTvLocalIds,
    setSessionTvLocalIds,
    removeAdding,
    removeFromSet,
  };
}
