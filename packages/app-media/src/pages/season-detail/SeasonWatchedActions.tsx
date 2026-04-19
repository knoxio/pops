import { Button } from '@pops/ui';

interface SeasonWatchedActionsProps {
  isSeasonWatched: boolean;
  isPending: boolean;
  onMarkWatched: () => void;
}

/**
 * "Mark Season Watched" button or "All Watched" badge for a season.
 */
export function SeasonWatchedActions({
  isSeasonWatched,
  isPending,
  onMarkWatched,
}: SeasonWatchedActionsProps) {
  if (isSeasonWatched) {
    return (
      <div className="flex gap-2 mt-3">
        <span className="inline-flex items-center gap-1.5 text-sm text-success font-medium">
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          All Watched
        </span>
      </div>
    );
  }

  return (
    <div className="flex gap-2 mt-3">
      <Button variant="outline" size="sm" onClick={onMarkWatched} disabled={isPending}>
        Mark Season Watched
      </Button>
    </div>
  );
}
