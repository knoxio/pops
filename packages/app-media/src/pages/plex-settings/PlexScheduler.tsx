import { Clock, RefreshCw } from 'lucide-react';

import { Button, Input, Label } from '@pops/ui';

interface SchedulerData {
  isRunning: boolean;
  intervalMs: number;
  nextSyncAt?: string | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
  moviesSynced?: number;
  tvShowsSynced?: number;
}

interface PlexSchedulerProps {
  schedulerHours: number;
  setSchedulerHours: (v: number) => void;
  movieSectionId: string;
  tvSectionId: string;
  scheduler: SchedulerData | undefined;
  isSchedulerRunning: boolean;
  startScheduler: {
    mutate: (data: { intervalMs: number; movieSectionId?: string; tvSectionId?: string }) => void;
    isPending: boolean;
  };
  stopScheduler: { mutate: () => void; isPending: boolean };
}

export function PlexScheduler({
  schedulerHours,
  setSchedulerHours,
  movieSectionId,
  tvSectionId,
  scheduler,
  isSchedulerRunning,
  startScheduler,
  stopScheduler,
}: PlexSchedulerProps) {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Auto Sync Scheduler</h2>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label htmlFor="scheduler-hours" className="text-muted-foreground font-normal">
            Sync every
          </Label>
          <Input
            id="scheduler-hours"
            type="number"
            min={1}
            max={168}
            value={schedulerHours}
            onChange={(e) => {
              setSchedulerHours(Math.max(1, parseInt(e.target.value) || 1));
            }}
            className="w-20"
            disabled={isSchedulerRunning}
          />
          <span className="text-sm text-muted-foreground">hours</span>
        </div>

        {isSchedulerRunning ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              stopScheduler.mutate();
            }}
            disabled={stopScheduler.isPending}
          >
            {stopScheduler.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : null}
            Stop Scheduler
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => {
              startScheduler.mutate({
                intervalMs: schedulerHours * 60 * 60 * 1000,
                movieSectionId: movieSectionId || undefined,
                tvSectionId: tvSectionId || undefined,
              });
            }}
            disabled={startScheduler.isPending}
          >
            {startScheduler.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : null}
            Start Scheduler
          </Button>
        )}
      </div>

      {/* Scheduler status */}
      <div className="text-sm text-muted-foreground space-y-1">
        {isSchedulerRunning ? (
          <>
            <p className="text-success">
              Scheduler active — syncing every{' '}
              {Math.round((scheduler?.intervalMs ?? 0) / (60 * 60 * 1000))} hours
            </p>
            {scheduler?.nextSyncAt && (
              <p>Next sync: {new Date(scheduler.nextSyncAt).toLocaleTimeString()}</p>
            )}
          </>
        ) : (
          <p>Scheduler off</p>
        )}
        {scheduler?.lastSyncAt && (
          <p>Last sync: {new Date(scheduler.lastSyncAt).toLocaleString()}</p>
        )}
        {scheduler?.lastSyncError && (
          <p className="text-destructive/80">Last error: {scheduler.lastSyncError}</p>
        )}
        {(scheduler?.moviesSynced ?? 0) > 0 && (
          <p>Total movies synced: {scheduler?.moviesSynced}</p>
        )}
        {(scheduler?.tvShowsSynced ?? 0) > 0 && (
          <p>Total TV shows synced: {scheduler?.tvShowsSynced}</p>
        )}
      </div>
    </div>
  );
}
