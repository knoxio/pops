import { Button } from '@pops/ui';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import type { DiscoverWatchSyncResult } from '../types';

interface DiscoverSyncResultDisplayProps {
  result: DiscoverWatchSyncResult | null;
  isRunning: boolean;
}

export function DiscoverSyncResultDisplay({ result, isRunning }: DiscoverSyncResultDisplayProps) {
  const [showErrors, setShowErrors] = useState(false);

  if (!result) return null;

  const r = result;
  const allErrors = [...(r.movies.errorSamples ?? []), ...(r.tvShows.errorSamples ?? [])];
  const totalAdded = (r.movies.added ?? 0) + (r.tvShows.added ?? 0);
  const totalLogged = r.movies.logged + r.tvShows.logged;
  const totalAlreadyLogged = r.movies.alreadyLogged + r.tvShows.alreadyLogged;
  const totalNotFound = r.movies.notFound + r.tvShows.notFound;
  const totalErrors = r.movies.errors + r.tvShows.errors;

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-medium">
          {isRunning ? 'Cloud Sync Progress:' : 'Cloud Sync Results:'}
        </span>
        {totalAdded > 0 && <span className="text-blue-400">{totalAdded} added to library</span>}
        {totalLogged > 0 && <span className="text-emerald-400">{totalLogged} watches logged</span>}
        {totalAlreadyLogged > 0 && (
          <span className="text-muted-foreground">{totalAlreadyLogged} already tracked</span>
        )}
        {totalNotFound > 0 && (
          <span className="text-muted-foreground">{totalNotFound} not found</span>
        )}
        {totalErrors > 0 && <span className="text-red-400">{totalErrors} errors</span>}
      </div>
      {!isRunning && (
        <p className="text-xs text-muted-foreground">
          Processed {r.movies.total} movie and {r.tvShows.total} TV episode activity entries
        </p>
      )}
      {allErrors.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center gap-1 text-xs h-auto p-0 text-red-400 hover:text-red-300"
          >
            {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showErrors ? 'Hide' : 'Show'} error details
          </Button>
          {showErrors && (
            <div className="mt-2 space-y-1 text-xs text-red-400/80">
              {allErrors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
