import { Ban, Clock, EyeOff, MoreHorizontal } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '../primitives/tooltip';
import { Button } from './Button';
import { DropdownMenu } from './DropdownMenu';

export interface ResponsiveActionBarMovie {
  id: number;
  title: string;
}

export function StaleButton({
  movie,
  testId,
  pending,
  onStale,
}: {
  movie: ResponsiveActionBarMovie;
  testId: string;
  pending?: boolean;
  onStale: (id: number) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onStale(movie.id)}
          disabled={pending}
          aria-label={`Mark ${movie.title} as stale`}
          data-testid={testId}
        >
          <Clock className="h-3.5 w-3.5 mr-1.5" />
          <span className="hidden sm:inline">Stale:</span>
          <span className="truncate max-w-[8rem]">{movie.title}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Mark as stale — reduces score weight for future comparisons</TooltipContent>
    </Tooltip>
  );
}

export interface MobileMenuProps {
  movieA: ResponsiveActionBarMovie;
  movieB: ResponsiveActionBarMovie;
  onNA: () => void;
  onBlacklist: (m: ResponsiveActionBarMovie) => void;
  naPending?: boolean;
  blacklistPending?: boolean;
}

export function MobileMenu({
  movieA,
  movieB,
  onNA,
  onBlacklist,
  naPending,
  blacklistPending,
}: MobileMenuProps) {
  return (
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
  );
}

export function NotWatchedButton({
  movie,
  testId,
  pending,
  onBlacklist,
}: {
  movie: ResponsiveActionBarMovie;
  testId: string;
  pending?: boolean;
  onBlacklist: (m: ResponsiveActionBarMovie) => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onBlacklist(movie)}
      disabled={pending}
      className="text-destructive border-destructive/50 hover:bg-destructive/10"
      data-testid={testId}
    >
      <EyeOff className="h-3.5 w-3.5 mr-1.5" />
      Not Watched: {movie.title}
    </Button>
  );
}

export interface DesktopRowProps {
  movieA: ResponsiveActionBarMovie;
  movieB: ResponsiveActionBarMovie;
  onNA: () => void;
  onBlacklist: (m: ResponsiveActionBarMovie) => void;
  naPending?: boolean;
  blacklistPending?: boolean;
}

export function DesktopRow({
  movieA,
  movieB,
  onNA,
  onBlacklist,
  naPending,
  blacklistPending,
}: DesktopRowProps) {
  return (
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
      <NotWatchedButton
        movie={movieA}
        testId="not-watched-a-button"
        pending={blacklistPending}
        onBlacklist={onBlacklist}
      />
      <NotWatchedButton
        movie={movieB}
        testId="not-watched-b-button"
        pending={blacklistPending}
        onBlacklist={onBlacklist}
      />
    </div>
  );
}
