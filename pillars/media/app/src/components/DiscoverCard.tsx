import { Check, Eye } from 'lucide-react';

/**
 * DiscoverCard — poster card for a TMDB discovery result.
 * Displays poster, title, year, TMDB rating, and action buttons.
 *
 * Uses CardWithActionOverlay for the poster shell.
 */
import { Badge, CardWithActionOverlay, cn } from '@pops/ui';

import { DiscoverCardOverlay } from './discover-card/DiscoverCardOverlay';

export interface DiscoverCardProps {
  tmdbId: number;
  title: string;
  releaseDate: string;
  posterPath: string | null;
  posterUrl: string | null;
  voteAverage: number;
  inLibrary: boolean;
  isWatched?: boolean;
  onWatchlist?: boolean;
  isAddingToLibrary?: boolean;
  isAddingToWatchlist?: boolean;
  isMarkingWatched?: boolean;
  isMarkingRewatched?: boolean;
  onAddToLibrary?: (tmdbId: number) => void;
  onAddToWatchlist?: (tmdbId: number) => void;
  onRemoveFromWatchlist?: (tmdbId: number) => void;
  isRemovingFromWatchlist?: boolean;
  onMarkWatched?: (tmdbId: number) => void;
  onMarkRewatched?: (tmdbId: number) => void;
  onNotInterested?: (tmdbId: number) => void;
  /** Whether a dismiss mutation is in progress for this card. */
  isDismissing?: boolean;
  /** Match percentage (0–100) from preference profile scoring. */
  matchPercentage?: number;
  /** Brief explanation of match, e.g. "Action, Sci-Fi". */
  matchReason?: string;
  className?: string;
}

function getStatusBadge(isWatched?: boolean, inLibrary?: boolean) {
  if (isWatched) {
    return (
      <Badge variant="secondary" className="gap-0.5 text-xs">
        <Eye className="h-3 w-3" />
        Watched
      </Badge>
    );
  }
  if (inLibrary) {
    return (
      <Badge variant="secondary" className="gap-0.5 text-xs">
        <Check className="h-3 w-3" />
        Owned
      </Badge>
    );
  }
  return undefined;
}

function getMatchClass(matchPercentage: number): string {
  if (matchPercentage >= 85) return 'text-success';
  if (matchPercentage >= 70) return 'text-success/70';
  return 'text-muted-foreground';
}

function MatchInfo({
  matchPercentage,
  matchReason,
}: {
  matchPercentage: number;
  matchReason?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className={cn('text-xs font-semibold', getMatchClass(matchPercentage))}>
        {matchPercentage}% Match
      </span>
      {matchReason && (
        <span className="text-xs text-muted-foreground truncate">· {matchReason}</span>
      )}
    </div>
  );
}

export function DiscoverCard(props: DiscoverCardProps) {
  const {
    title,
    releaseDate,
    posterUrl,
    voteAverage,
    inLibrary,
    isWatched,
    matchPercentage,
    matchReason,
    className,
  } = props;
  const year = releaseDate ? releaseDate.slice(0, 4) : null;

  const topLeft =
    voteAverage > 0 ? (
      <Badge variant="default" className="text-xs">
        {voteAverage.toFixed(1)}
      </Badge>
    ) : undefined;

  return (
    <div className={cn('group flex w-36 shrink-0 flex-col gap-1.5 sm:w-40', className)}>
      <CardWithActionOverlay
        src={posterUrl}
        alt={`${title} poster`}
        topLeft={topLeft}
        topRight={getStatusBadge(isWatched, inLibrary)}
        overlay={<DiscoverCardOverlay {...props} year={year} />}
      />
      <div className="space-y-0.5 px-0.5">
        <h3 className="text-sm font-medium leading-tight line-clamp-2">{title}</h3>
        {year && <p className="text-xs text-muted-foreground">{year}</p>}
        {matchPercentage != null && matchPercentage > 0 && (
          <MatchInfo matchPercentage={matchPercentage} matchReason={matchReason} />
        )}
      </div>
    </div>
  );
}

DiscoverCard.displayName = 'DiscoverCard';
