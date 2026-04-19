import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useCallback, useMemo, useState } from 'react';

import {
  DISMISS_ZONES,
  TIERS,
  type DismissZone,
  type Tier,
  type TierMovie,
  type TierPlacements,
} from './types';

import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';

interface UseTierBoardArgs {
  movies: TierMovie[];
  onSubmit: (placements: Array<{ movieId: number; tier: Tier }>) => void;
  onNotWatched?: (movieId: number) => void;
  onMarkStale?: (movieId: number) => void;
  onNA?: (movieId: number) => void;
}

function findTierContaining(placements: TierPlacements, movieId: number): Tier | 'unranked' {
  for (const tier of TIERS) {
    if (placements[tier].includes(movieId)) return tier;
  }
  return 'unranked';
}

function resolveTargetContainer(prev: TierPlacements, overId: string): Tier | 'unranked' | null {
  if (TIERS.includes(overId as Tier)) return overId as Tier;
  if (overId === 'unranked') return 'unranked';
  return findTierContaining(prev, Number(overId));
}

function moveBetweenTiers(
  prev: TierPlacements,
  activeIdNum: number,
  source: Tier | 'unranked',
  target: Tier | 'unranked'
): TierPlacements {
  if (source === target) return prev;
  const next = { ...prev };
  if (source !== 'unranked') {
    next[source] = prev[source].filter((id) => id !== activeIdNum);
  }
  if (target !== 'unranked' && !next[target].includes(activeIdNum)) {
    next[target] = [...prev[target], activeIdNum];
  }
  return next;
}

function placeInTarget(
  prev: TierPlacements,
  activeIdNum: number,
  target: Tier | 'unranked'
): TierPlacements {
  const next = { ...prev };
  for (const tier of TIERS) {
    next[tier] = prev[tier].filter((id) => id !== activeIdNum);
  }
  if (target !== 'unranked') {
    next[target] = [...next[target], activeIdNum];
  }
  return next;
}

function clearMovie(prev: TierPlacements, movieId: number): TierPlacements {
  const next = { ...prev };
  for (const tier of TIERS) {
    next[tier] = prev[tier].filter((id) => id !== movieId);
  }
  return next;
}

interface DragHandlerArgs {
  setPlacements: React.Dispatch<React.SetStateAction<TierPlacements>>;
  setActiveId: (id: number | null) => void;
  onNotWatched?: (id: number) => void;
  onMarkStale?: (id: number) => void;
  onNA?: (id: number) => void;
}

function useDragOverHandler(setPlacements: React.Dispatch<React.SetStateAction<TierPlacements>>) {
  return useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeIdNum = Number(active.id);
      const overId = String(over.id);
      setPlacements((prev) => {
        const source = findTierContaining(prev, activeIdNum);
        const target = resolveTargetContainer(prev, overId);
        if (target === null) return prev;
        return moveBetweenTiers(prev, activeIdNum, source, target);
      });
    },
    [setPlacements]
  );
}

function useDragEndHandler({
  setPlacements,
  setActiveId,
  handleDismiss,
}: {
  setPlacements: React.Dispatch<React.SetStateAction<TierPlacements>>;
  setActiveId: (id: number | null) => void;
  handleDismiss: (movieId: number, zone: DismissZone) => void;
}) {
  return useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over) return;
      const activeIdNum = Number(active.id);
      const overId = String(over.id);
      if (DISMISS_ZONES.includes(overId as DismissZone)) {
        handleDismiss(activeIdNum, overId as DismissZone);
        return;
      }
      setPlacements((prev) => {
        const target = resolveTargetContainer(prev, overId);
        if (target === null) return prev;
        return placeInTarget(prev, activeIdNum, target);
      });
    },
    [setPlacements, setActiveId, handleDismiss]
  );
}

function useDragHandlers(args: DragHandlerArgs) {
  const { setPlacements, setActiveId, onNotWatched, onMarkStale, onNA } = args;
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(Number(event.active.id));
    },
    [setActiveId]
  );
  const handleDismiss = useCallback(
    (movieId: number, zone: DismissZone) => {
      setPlacements((prev) => clearMovie(prev, movieId));
      if (zone === 'not-watched') onNotWatched?.(movieId);
      else if (zone === 'stale') onMarkStale?.(movieId);
      else if (zone === 'n-a') onNA?.(movieId);
    },
    [setPlacements, onNotWatched, onMarkStale, onNA]
  );
  const handleDragOver = useDragOverHandler(setPlacements);
  const handleDragEnd = useDragEndHandler({ setPlacements, setActiveId, handleDismiss });
  return { handleDragStart, handleDragOver, handleDragEnd };
}

export function useTierBoardModel({
  movies,
  onSubmit,
  onNotWatched,
  onMarkStale,
  onNA,
}: UseTierBoardArgs) {
  const [placements, setPlacements] = useState<TierPlacements>({
    S: [],
    A: [],
    B: [],
    C: [],
    D: [],
  });
  const [activeId, setActiveId] = useState<number | null>(null);

  const movieMap = useMemo(() => new Map(movies.map((m) => [m.mediaId, m])), [movies]);
  const placedIds = useMemo(() => new Set(Object.values(placements).flat()), [placements]);
  const unrankedMovies = useMemo(
    () => movies.filter((m) => !placedIds.has(m.mediaId)),
    [movies, placedIds]
  );
  const totalPlaced = placedIds.size;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const drag = useDragHandlers({ setPlacements, setActiveId, onNotWatched, onMarkStale, onNA });

  const handleSubmit = useCallback(() => {
    const result: Array<{ movieId: number; tier: Tier }> = [];
    for (const tier of TIERS) {
      for (const movieId of placements[tier]) {
        result.push({ movieId, tier });
      }
    }
    onSubmit(result);
  }, [placements, onSubmit]);

  return {
    placements,
    activeMovie: activeId ? movieMap.get(activeId) : null,
    movieMap,
    unrankedMovies,
    totalPlaced,
    sensors,
    ...drag,
    handleSubmit,
  };
}
