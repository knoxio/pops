import { useCallback } from 'react';

import type { DiscoverActionResult } from '../../hooks/useDiscoverCardActions';
import type { ShelfItem } from './types';

export interface ShelfActionHandlers {
  onAddToLibrary: (tmdbId: number) => Promise<DiscoverActionResult>;
  onAddToWatchlist: (tmdbId: number) => Promise<DiscoverActionResult>;
  onRemoveFromWatchlist: (tmdbId: number) => Promise<DiscoverActionResult>;
  onMarkWatched: (tmdbId: number) => Promise<DiscoverActionResult>;
  onMarkRewatched: (tmdbId: number) => Promise<DiscoverActionResult>;
}

export function useShelfActions(
  handlers: ShelfActionHandlers,
  patchItem: (tmdbId: number, patch: Partial<ShelfItem>) => void
) {
  const handleAddToLibrary = useCallback(
    async (tmdbId: number) => {
      const result = await handlers.onAddToLibrary(tmdbId);
      if (result.ok) patchItem(tmdbId, { inLibrary: true });
    },
    [handlers, patchItem]
  );

  const handleAddToWatchlist = useCallback(
    async (tmdbId: number) => {
      const result = await handlers.onAddToWatchlist(tmdbId);
      if (result.ok) patchItem(tmdbId, { inLibrary: true, onWatchlist: true });
    },
    [handlers, patchItem]
  );

  const handleRemoveFromWatchlist = useCallback(
    async (tmdbId: number) => {
      const result = await handlers.onRemoveFromWatchlist(tmdbId);
      if (result.ok) patchItem(tmdbId, { onWatchlist: false });
    },
    [handlers, patchItem]
  );

  const handleMarkWatched = useCallback(
    async (tmdbId: number) => {
      const result = await handlers.onMarkWatched(tmdbId);
      if (result.ok) patchItem(tmdbId, { inLibrary: true, isWatched: true, onWatchlist: false });
    },
    [handlers, patchItem]
  );

  const handleMarkRewatched = useCallback(
    async (tmdbId: number) => {
      const result = await handlers.onMarkRewatched(tmdbId);
      if (result.ok) patchItem(tmdbId, { inLibrary: true, isWatched: true });
    },
    [handlers, patchItem]
  );

  return {
    handleAddToLibrary,
    handleAddToWatchlist,
    handleRemoveFromWatchlist,
    handleMarkWatched,
    handleMarkRewatched,
  };
}
