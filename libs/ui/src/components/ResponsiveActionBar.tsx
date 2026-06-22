import { Button } from './Button';
import {
  DesktopRow,
  MobileMenu,
  type ResponsiveActionBarMovie,
  StaleButton,
} from './ResponsiveActionBar.parts';

export type { ResponsiveActionBarMovie } from './ResponsiveActionBar.parts';

/**
 * Two-tier action bar: primary row always visible; secondary on md+;
 * overflow menu on small screens.
 */
export interface ResponsiveActionBarProps {
  movieA: ResponsiveActionBarMovie;
  movieB: ResponsiveActionBarMovie;
  onSkip: () => void;
  onStale: (movieId: number) => void;
  onNA: () => void;
  onBlacklist: (movie: ResponsiveActionBarMovie) => void;
  onDone: () => void;
  skipPending?: boolean;
  stalePending?: boolean;
  naPending?: boolean;
  blacklistPending?: boolean;
  /** Root wrapper `data-testid` (compare/arena pages may override). */
  dataTestId?: string;
}

interface PrimaryRowProps {
  movieA: ResponsiveActionBarMovie;
  movieB: ResponsiveActionBarMovie;
  onSkip: () => void;
  onStale: (id: number) => void;
  onNA: () => void;
  onBlacklist: (m: ResponsiveActionBarMovie) => void;
  onDone: () => void;
  skipPending?: boolean;
  stalePending?: boolean;
  naPending?: boolean;
  blacklistPending?: boolean;
}

function PrimaryRow({
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
}: PrimaryRowProps) {
  return (
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
      <StaleButton
        movie={movieA}
        testId="stale-a-button"
        pending={stalePending}
        onStale={onStale}
      />
      <StaleButton
        movie={movieB}
        testId="stale-b-button"
        pending={stalePending}
        onStale={onStale}
      />
      <Button variant="ghost" size="sm" onClick={onDone} data-testid="done-button">
        Done
      </Button>
      <MobileMenu
        movieA={movieA}
        movieB={movieB}
        onNA={onNA}
        onBlacklist={onBlacklist}
        naPending={naPending}
        blacklistPending={blacklistPending}
      />
    </div>
  );
}

export function ResponsiveActionBar({
  dataTestId = 'responsive-action-bar',
  ...props
}: ResponsiveActionBarProps) {
  return (
    <div className="flex flex-col items-center gap-3" data-testid={dataTestId}>
      <PrimaryRow {...props} />
      <DesktopRow
        movieA={props.movieA}
        movieB={props.movieB}
        onNA={props.onNA}
        onBlacklist={props.onBlacklist}
        naPending={props.naPending}
        blacklistPending={props.blacklistPending}
      />
    </div>
  );
}

ResponsiveActionBar.displayName = 'ResponsiveActionBar';
