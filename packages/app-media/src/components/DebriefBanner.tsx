import { ClipboardList, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { trpc } from '@pops/api-client';
/**
 * DebriefBanner — shows a notification when movies are pending debrief.
 *
 * Dismissible (session-scoped via useState). Hidden when no pending debriefs.
 */
import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

export function DebriefBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { data } = trpc.media.comparisons.getPendingDebriefs.useQuery();

  const debriefs = data?.data;
  if (!debriefs || debriefs.length === 0 || dismissed) return null;

  const count = debriefs.length;
  const firstSession = debriefs[0];
  if (!firstSession) return null;

  return (
    <Alert data-testid="debrief-banner">
      <ClipboardList />
      <AlertTitle>{count === 1 ? '1 movie to debrief' : `${count} movies to debrief`}</AlertTitle>
      <AlertDescription>
        <span>
          Rate your recently watched {count === 1 ? 'movie' : 'movies'} across dimensions.{' '}
          <Link
            to={`/media/debrief/${firstSession.movieId}`}
            className="font-medium underline underline-offset-4 hover:text-foreground"
          >
            Start debrief
          </Link>
        </span>
      </AlertDescription>
      <button
        type="button"
        aria-label="Dismiss debrief banner"
        className="absolute right-3 top-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        onClick={() => {
          setDismissed(true);
        }}
      >
        <X className="size-4" />
      </button>
    </Alert>
  );
}
