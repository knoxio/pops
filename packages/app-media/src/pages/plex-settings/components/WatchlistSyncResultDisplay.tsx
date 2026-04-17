import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import type { WatchlistSyncResult } from '../types';

interface WatchlistSyncResultDisplayProps {
  result: WatchlistSyncResult;
}

export function WatchlistSyncResultDisplay({ result }: WatchlistSyncResultDisplayProps) {
  const [showErrors, setShowErrors] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const skipReasons = result.skipReasons ?? [];

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-medium">Watchlist Results:</span>
        <span className="text-success">{result.added} added</span>
        <span className="text-orange-400">{result.removed} removed</span>
        <span className="text-muted-foreground">{result.skipped} skipped</span>
        {result.errors.length > 0 && (
          <span className="text-destructive/80">{result.errors.length} errors</span>
        )}
      </div>
      {skipReasons.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSkipped(!showSkipped)}
            className="flex items-center gap-1 text-xs h-auto p-0 text-muted-foreground hover:text-foreground"
          >
            {showSkipped ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showSkipped ? 'Hide' : 'Show'} skip reasons
          </Button>
          {showSkipped && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {skipReasons.map((skip, i) => (
                <p key={i}>
                  <span className="font-medium">{skip.title}:</span> {skip.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {result.errors.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center gap-1 text-xs h-auto p-0 text-destructive/80 hover:text-destructive/60"
          >
            {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showErrors ? 'Hide' : 'Show'} error details
          </Button>
          {showErrors && (
            <div className="mt-2 space-y-1 text-xs text-destructive/80">
              {result.errors.map((err, i) => (
                <p key={i}>
                  <span className="font-medium">{err.title}:</span> {err.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
