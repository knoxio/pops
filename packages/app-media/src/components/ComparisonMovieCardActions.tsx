import { Ban, Bookmark, Clock, EyeOff } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

import type { ComparisonMovieCardMovie, ComparisonMovieCardProps } from './ComparisonMovieCard';

export function WatchlistButton({
  movie,
  onToggle,
  isOnWatchlist,
  pending,
}: {
  movie: ComparisonMovieCardMovie;
  onToggle: () => void;
  isOnWatchlist?: boolean;
  pending?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          disabled={pending}
          className={`p-1.5 rounded-full backdrop-blur-sm transition-colors ${
            isOnWatchlist
              ? 'bg-app-accent/90 text-app-accent-foreground hover:bg-destructive/90 hover:text-white'
              : 'bg-black/50 text-white/80 hover:text-white hover:bg-black/70'
          }`}
          aria-label={
            isOnWatchlist
              ? `Remove ${movie.title} from watchlist`
              : `Add ${movie.title} to watchlist`
          }
          data-testid={`watchlist-button-${movie.id}`}
        >
          <Bookmark className={`h-4 w-4 ${isOnWatchlist ? 'fill-current' : ''}`} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {isOnWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
      </TooltipContent>
    </Tooltip>
  );
}

export function ScoreDeltaBadge({ movieId, scoreDelta }: { movieId: number; scoreDelta: number }) {
  return (
    <div
      className={`px-2 py-1 rounded-full text-xs font-bold tabular-nums animate-bounce ${
        scoreDelta > 0 ? 'bg-success/90 text-white' : 'bg-destructive/90 text-white'
      }`}
      data-testid={`score-delta-${movieId}`}
    >
      {scoreDelta > 0 ? '+' : ''}
      {scoreDelta}
    </div>
  );
}

function ActionIconButton({
  icon: Icon,
  onClick,
  disabled,
  ariaLabel,
  testId,
  tooltip,
  hoverDestructive,
}: {
  icon: typeof Ban;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  testId: string;
  tooltip: string;
  hoverDestructive?: boolean;
}) {
  const hoverColor = hoverDestructive ? 'hover:text-destructive/80' : 'hover:text-white';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          disabled={disabled}
          className={`p-2 rounded-full bg-black/40 text-white/80 ${hoverColor} hover:bg-black/60 backdrop-blur-sm transition-colors`}
          aria-label={ariaLabel}
          data-testid={testId}
        >
          <Icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function CardActionsOverlay({
  movie,
  onNA,
  naPending,
  onMarkStale,
  stalePending,
  onBlacklist,
  blacklistPending,
}: Pick<
  ComparisonMovieCardProps,
  'onNA' | 'naPending' | 'onMarkStale' | 'stalePending' | 'onBlacklist' | 'blacklistPending'
> & { movie: ComparisonMovieCardMovie }) {
  if (!(onNA ?? onMarkStale ?? onBlacklist)) return undefined;
  return (
    <div className="flex justify-center gap-2">
      {onNA && (
        <ActionIconButton
          icon={Ban}
          onClick={onNA}
          disabled={naPending}
          ariaLabel={`N/A: ${movie.title}`}
          testId={`na-button-${movie.id}`}
          tooltip="N/A — exclude from this dimension"
        />
      )}
      {onMarkStale && (
        <ActionIconButton
          icon={Clock}
          onClick={onMarkStale}
          disabled={stalePending}
          ariaLabel={`Mark ${movie.title} as stale`}
          testId={`stale-button-${movie.id}`}
          tooltip="Stale — reduce score weight"
        />
      )}
      {onBlacklist && (
        <ActionIconButton
          icon={EyeOff}
          onClick={onBlacklist}
          disabled={blacklistPending}
          ariaLabel={`Not watched ${movie.title}`}
          testId={`blacklist-button-${movie.id}`}
          tooltip="Not watched"
          hoverDestructive
        />
      )}
    </div>
  );
}
