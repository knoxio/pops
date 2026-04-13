import { Button, Select } from '@pops/ui';
import { Film, RefreshCw, Tv } from 'lucide-react';

import type { SyncResult } from './types';

interface SyncJob {
  isRunning: boolean;
  isStarting: boolean;
  progress: { processed: number; total: number } | null;
  result: unknown;
  start: (params: { sectionId: string }) => void;
}

interface PlexMediaSyncProps {
  movieSectionId: string;
  setMovieSectionId: (v: string) => void;
  tvSectionId: string;
  setTvSectionId: (v: string) => void;
  movieLibraries: { key: string; title: string; type: string }[];
  tvLibraries: { key: string; title: string; type: string }[];
  movieSync: SyncJob;
  tvSync: SyncJob;
  saveSectionIds: { mutate: (data: { movieSectionId?: string; tvSectionId?: string }) => void };
  SyncResultDisplay: React.ComponentType<{ result: SyncResult; label: string }>;
}

export function PlexMediaSync({
  movieSectionId,
  setMovieSectionId,
  tvSectionId,
  setTvSectionId,
  movieLibraries,
  tvLibraries,
  movieSync,
  tvSync,
  saveSectionIds,
  SyncResultDisplay,
}: PlexMediaSyncProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Movie sync */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Film className="h-4 w-4" />
          Sync Movies
        </div>

        {movieLibraries.length > 0 ? (
          <>
            <Select
              value={movieSectionId}
              onChange={(e) => {
                const id = e.target.value;
                setMovieSectionId(id);
                if (id) saveSectionIds.mutate({ movieSectionId: id });
              }}
              size="sm"
              placeholder="Select library..."
              options={movieLibraries.map((lib) => ({
                value: lib.key,
                label: lib.title,
              }))}
              aria-label="Select movie library"
            />

            <Button
              size="sm"
              disabled={!movieSectionId || movieSync.isRunning || movieSync.isStarting}
              onClick={() => movieSync.start({ sectionId: movieSectionId })}
              className="w-full"
            >
              {movieSync.isRunning ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {movieSync.isRunning && movieSync.progress
                ? `Syncing... ${movieSync.progress.processed}/${movieSync.progress.total}`
                : 'Sync Movies'}
            </Button>

            {movieSync.result != null && (
              <SyncResultDisplay result={movieSync.result as SyncResult} label="Movie" />
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No movie libraries found</p>
        )}
      </div>

      {/* TV sync */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Tv className="h-4 w-4" />
          Sync TV Shows
        </div>

        {tvLibraries.length > 0 ? (
          <>
            <Select
              value={tvSectionId}
              onChange={(e) => {
                const id = e.target.value;
                setTvSectionId(id);
                if (id) saveSectionIds.mutate({ tvSectionId: id });
              }}
              size="sm"
              placeholder="Select library..."
              options={tvLibraries.map((lib) => ({
                value: lib.key,
                label: lib.title,
              }))}
              aria-label="Select TV library"
            />

            <Button
              size="sm"
              disabled={!tvSectionId || tvSync.isRunning || tvSync.isStarting}
              onClick={() => tvSync.start({ sectionId: tvSectionId })}
              className="w-full"
            >
              {tvSync.isRunning ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {tvSync.isRunning && tvSync.progress
                ? `Syncing... ${tvSync.progress.processed}/${tvSync.progress.total}`
                : 'Sync TV Shows'}
            </Button>

            {tvSync.result != null && (
              <SyncResultDisplay result={tvSync.result as SyncResult} label="TV" />
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No TV libraries found</p>
        )}
      </div>
    </div>
  );
}
