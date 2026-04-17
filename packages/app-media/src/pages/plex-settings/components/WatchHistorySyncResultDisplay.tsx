import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import type { WatchHistorySyncResult } from '../types';

interface WatchHistorySyncResultDisplayProps {
  result: WatchHistorySyncResult;
}

export function WatchHistorySyncResultDisplay({ result }: WatchHistorySyncResultDisplayProps) {
  const [showShows, setShowShows] = useState(false);
  const [expandedShow, setExpandedShow] = useState<number | null>(null);

  const gapShows = result.shows.filter((s) => {
    const d = s.diagnostics;
    return d.seasonNotFound > 0 || d.episodeNotFound > 0;
  });

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3 text-sm">
      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-medium">Watch History Results:</span>
        {result.movies && result.movies.logged > 0 && (
          <span className="text-success">{result.movies.logged} movies logged</span>
        )}
        {result.summary.episodesLogged > 0 && (
          <span className="text-success">{result.summary.episodesLogged} episodes logged</span>
        )}
        {result.summary.episodesAlreadyLogged > 0 && (
          <span className="text-muted-foreground">
            {result.summary.episodesAlreadyLogged} episodes already tracked
          </span>
        )}
        <span className="text-muted-foreground">
          {result.summary.showsProcessed} shows processed
        </span>
        {result.summary.showsWithGaps > 0 && (
          <span className="text-amber-400">{result.summary.showsWithGaps} shows with gaps</span>
        )}
      </div>

      {/* Movie details */}
      {result.movies && result.movies.watched > 0 && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            Movies: {result.movies.watched} watched in Plex
            {result.movies.alreadyLogged > 0 && ` (${result.movies.alreadyLogged} already logged)`}
            {result.movies.noLocalMatch > 0 && (
              <span className="text-amber-400"> ({result.movies.noLocalMatch} not in library)</span>
            )}
          </p>
        </div>
      )}

      {/* Show-level details */}
      {gapShows.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => {
              setShowShows(!showShows);
            }}
            className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            {showShows ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showShows ? 'Hide' : 'Show'} {gapShows.length} shows with matching issues
          </button>
          {showShows && (
            <div className="mt-2 space-y-1">
              {gapShows.map((show, i) => {
                const d = show.diagnostics;
                const isExpanded = expandedShow === i;
                return (
                  <div key={i} className="rounded border border-muted bg-background/50 p-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedShow(isExpanded ? null : i);
                      }}
                      className="flex items-center gap-2 w-full text-left text-xs"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      )}
                      <span className="font-medium flex-1">{show.title}</span>
                      <span className="text-muted-foreground">
                        {d.matched + d.alreadyLogged}/{d.plexWatched} tracked
                      </span>
                      {show.plexViewedLeafCount !== null && (
                        <span className="text-muted-foreground">
                          (Plex: {show.plexViewedLeafCount} watched)
                        </span>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="mt-2 pl-5 space-y-1 text-xs text-muted-foreground">
                        <p>
                          Plex episodes: {d.plexTotal} total, {d.plexWatched} watched
                        </p>
                        <p>
                          Matched: {d.matched}
                          {d.alreadyLogged > 0 && ` | Already logged: ${d.alreadyLogged}`}
                        </p>
                        {d.seasonNotFound > 0 && (
                          <p className="text-amber-400">
                            Season not found: {d.seasonNotFound} episodes
                            {d.missingSeasonsPreview.length > 0 &&
                              ` (seasons: ${d.missingSeasonsPreview.join(', ')})`}
                          </p>
                        )}
                        {d.episodeNotFound > 0 && (
                          <div className="text-amber-400">
                            <p>Episode not found: {d.episodeNotFound} episodes</p>
                            {d.missingEpisodesPreview.length > 0 && (
                              <ul className="ml-3 mt-0.5">
                                {d.missingEpisodesPreview.map((ep, j) => (
                                  <li key={j}>
                                    S{String(ep.seasonNumber).padStart(2, '0')}E
                                    {String(ep.episodeNumber).padStart(2, '0')} — {ep.title}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
