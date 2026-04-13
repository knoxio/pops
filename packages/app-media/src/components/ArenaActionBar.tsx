import { Button, DropdownMenu, Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';
import { Ban, Clock, EyeOff, MoreHorizontal } from 'lucide-react';

export interface ArenaMovie {
  id: number;
  title: string;
}

export interface ArenaActionBarProps {
  movieA: ArenaMovie;
  movieB: ArenaMovie;
  onSkip: () => void;
  onStale: (movieId: number) => void;
  onNA: () => void;
  onBlacklist: (movie: ArenaMovie) => void;
  onDone: () => void;
  skipPending?: boolean;
  stalePending?: boolean;
  naPending?: boolean;
  blacklistPending?: boolean;
}

export function ArenaActionBar({
  movieA,
  movieB,
  onSkip,
  onStale,
  onNA,
  onBlacklist,
  onDone,
  skipPending,
  stalePending,
  naPending,
  blacklistPending,
}: ArenaActionBarProps) {
  return (
    <div className="flex flex-col items-center gap-3" data-testid="arena-action-bar">
      {/* Primary row: always visible */}
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onSkip}
          disabled={skipPending}
          data-testid="skip-button"
        >
          {skipPending ? 'Skipping…' : 'Skip this pair'}
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStale(movieA.id)}
              disabled={stalePending}
              aria-label={`Mark ${movieA.title} as stale`}
              data-testid="stale-a-button"
            >
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden sm:inline">Stale:</span>
              <span className="truncate max-w-[8rem]">{movieA.title}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Mark as stale — reduces score weight for future comparisons
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStale(movieB.id)}
              disabled={stalePending}
              aria-label={`Mark ${movieB.title} as stale`}
              data-testid="stale-b-button"
            >
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden sm:inline">Stale:</span>
              <span className="truncate max-w-[8rem]">{movieB.title}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Mark as stale — reduces score weight for future comparisons
          </TooltipContent>
        </Tooltip>

        <Button variant="ghost" size="sm" onClick={onDone} data-testid="done-button">
          Done
        </Button>

        {/* Overflow menu for secondary/destructive actions on mobile */}
        <div className="md:hidden">
          <DropdownMenu
            trigger={
              <Button variant="outline" size="sm" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
            groups={[
              {
                items: [
                  {
                    label: 'N/A (exclude both)',
                    value: 'na',
                    icon: <Ban className="h-4 w-4" />,
                    disabled: naPending,
                    onSelect: onNA,
                  },
                ],
              },
              {
                label: 'Destructive',
                items: [
                  {
                    label: `Not Watched: ${movieA.title}`,
                    value: 'blacklist-a',
                    variant: 'destructive' as const,
                    icon: <EyeOff className="h-4 w-4" />,
                    disabled: blacklistPending,
                    onSelect: () => onBlacklist(movieA),
                  },
                  {
                    label: `Not Watched: ${movieB.title}`,
                    value: 'blacklist-b',
                    variant: 'destructive' as const,
                    icon: <EyeOff className="h-4 w-4" />,
                    disabled: blacklistPending,
                    onSelect: () => onBlacklist(movieB),
                  },
                ],
              },
            ]}
          />
        </div>
      </div>

      {/* Secondary row: visible on desktop only */}
      <div className="hidden md:flex justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onNA}
          disabled={naPending}
          className="text-muted-foreground"
          data-testid="na-button"
        >
          <Ban className="h-3.5 w-3.5 mr-1.5" />
          {naPending ? 'Excluding…' : 'N/A'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onBlacklist(movieA)}
          disabled={blacklistPending}
          className="text-destructive border-destructive/50 hover:bg-destructive/10"
          data-testid="not-watched-a-button"
        >
          <EyeOff className="h-3.5 w-3.5 mr-1.5" />
          Not Watched: {movieA.title}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onBlacklist(movieB)}
          disabled={blacklistPending}
          className="text-destructive border-destructive/50 hover:bg-destructive/10"
          data-testid="not-watched-b-button"
        >
          <EyeOff className="h-3.5 w-3.5 mr-1.5" />
          Not Watched: {movieB.title}
        </Button>
      </div>
    </div>
  );
}
