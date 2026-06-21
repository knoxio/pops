/**
 * TierListBoard — drag-and-drop tier placement board.
 *
 * Renders 5 tier rows (S/A/B/C/D) as drop zones plus an unranked pool.
 * Movies can be dragged between tiers and back to unranked.
 * Submit button is disabled until at least 2 movies are placed.
 */
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core';

import { Button } from '@pops/ui';

import { MovieCardOverlay } from './tier-list-board/MovieCard';
import { TIERS, type Tier, type TierMovie, type TierPlacements } from './tier-list-board/types';
import { useTierBoardModel } from './tier-list-board/useTierBoardModel';
import { DismissDropZone, TierRow, UnrankedPool } from './tier-list-board/Zones';

export type { Tier, TierMovie, TierPlacements };

interface TierListBoardProps {
  movies: TierMovie[];
  onSubmit: (placements: Array<{ movieId: number; tier: Tier }>) => void;
  submitPending?: boolean;
  onNotWatched?: (movieId: number) => void;
  onMarkStale?: (movieId: number) => void;
  onNA?: (movieId: number) => void;
}

export function TierListBoard(props: TierListBoardProps) {
  const { onNotWatched, onMarkStale, onNA, submitPending } = props;
  const model = useTierBoardModel(props);

  return (
    <DndContext
      sensors={model.sensors}
      collisionDetection={pointerWithin}
      onDragStart={model.handleDragStart}
      onDragOver={model.handleDragOver}
      onDragEnd={model.handleDragEnd}
    >
      <div className="space-y-2">
        {TIERS.map((tier) => (
          <TierRow
            key={tier}
            tier={tier}
            movieIds={model.placements[tier]}
            movieMap={model.movieMap}
          />
        ))}
        <UnrankedPool movies={model.unrankedMovies} />
        {(onNotWatched ?? onMarkStale ?? onNA) && (
          <div className="flex gap-2 mt-4">
            {onNotWatched && <DismissDropZone zone="not-watched" />}
            {onMarkStale && <DismissDropZone zone="stale" />}
            {onNA && <DismissDropZone zone="n-a" />}
          </div>
        )}
        <div className="flex justify-center pt-4">
          <Button onClick={model.handleSubmit} disabled={model.totalPlaced < 2 || submitPending}>
            {submitPending ? 'Submitting\u2026' : `Submit Tier List (${model.totalPlaced} placed)`}
          </Button>
        </div>
      </div>
      <DragOverlay>
        {model.activeMovie ? <MovieCardOverlay movie={model.activeMovie} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
