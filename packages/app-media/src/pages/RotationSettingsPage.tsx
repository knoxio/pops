import { AlertTriangle, Clock, HardDrive, Play, RefreshCw, Save, ScrollText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

/**
 * RotationSettingsPage — configure library rotation behaviour.
 *
 * PRD-072 US-02
 */
import { Button, Label, NumberInput, PageHeader, Select, Skeleton, Switch } from '@pops/ui';

import { SourceManagementSection } from '../components/SourceManagementSection';
import { trpc } from '../lib/trpc';

const SCHEDULE_PRESETS = [
  { value: '0 3 * * *', label: 'Daily at 3:00 AM' },
  { value: '0 6 * * *', label: 'Daily at 6:00 AM' },
  { value: '0 0 * * *', label: 'Daily at midnight' },
  { value: 'custom', label: 'Custom cron...' },
] as const;

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function RotationSettingsPage() {
  const statusQuery = trpc.media.rotation.status.useQuery();
  const settingsQuery = trpc.media.rotation.getSettings.useQuery();
  const lastLogQuery = trpc.media.rotation.getLastCycleLog.useQuery();
  const diskSpaceQuery = trpc.media.rotation.getDiskSpace.useQuery();

  const [enabled, setEnabled] = useState(false);
  const [schedulePreset, setSchedulePreset] = useState('0 3 * * *');
  const [customCron, setCustomCron] = useState('');
  const [targetFreeGb, setTargetFreeGb] = useState(100);
  const [leavingDays, setLeavingDays] = useState(7);
  const [dailyAdditions, setDailyAdditions] = useState(2);
  const [avgMovieGb, setAvgMovieGb] = useState(15);
  const [protectedDays, setProtectedDays] = useState(30);

  // Sync form from server settings
  useEffect(() => {
    if (settingsQuery.data) {
      const s = settingsQuery.data;
      setEnabled(s.enabled === 'true');
      const cron = s.cronExpression || '0 3 * * *';
      const isPreset = SCHEDULE_PRESETS.some((p) => p.value === cron && p.value !== 'custom');
      setSchedulePreset(isPreset ? cron : 'custom');
      setCustomCron(isPreset ? '' : cron);
      setTargetFreeGb(Number(s.targetFreeGb) || 100);
      setLeavingDays(Number(s.leavingDays) || 7);
      setDailyAdditions(Number(s.dailyAdditions) || 2);
      setAvgMovieGb(Number(s.avgMovieGb) || 15);
      setProtectedDays(Number(s.protectedDays) || 30);
    }
  }, [settingsQuery.data]);

  // Also sync enabled from live status
  useEffect(() => {
    if (statusQuery.data) {
      setEnabled(statusQuery.data.isRunning);
    }
  }, [statusQuery.data]);

  const utils = trpc.useUtils();

  const toggleMutation = trpc.media.rotation.toggle.useMutation({
    onSuccess: (data) => {
      toast.success(data.isRunning ? 'Rotation enabled' : 'Rotation disabled');
      void utils.media.rotation.status.invalidate();
      void utils.media.rotation.getSettings.invalidate();
    },
    onError: () => toast.error('Failed to toggle rotation'),
  });

  const saveMutation = trpc.media.rotation.saveSettings.useMutation({
    onSuccess: () => {
      toast.success('Settings saved');
      void utils.media.rotation.getSettings.invalidate();
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const runNowMutation = trpc.media.rotation.runNow.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Rotation cycle completed');
        void utils.media.rotation.status.invalidate();
        void utils.media.rotation.getLastCycleLog.invalidate();
        void utils.media.rotation.getDiskSpace.invalidate();
      } else {
        toast.error('message' in data ? data.message : 'Rotation cycle failed');
      }
    },
    onError: () => toast.error('Rotation cycle failed'),
  });

  const effectiveCron = schedulePreset === 'custom' ? customCron : schedulePreset;

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    toggleMutation.mutate({ enabled: checked, cronExpression: effectiveCron || undefined });
  };

  const handleSave = () => {
    saveMutation.mutate({
      cronExpression: effectiveCron || undefined,
      targetFreeGb,
      leavingDays,
      dailyAdditions,
      avgMovieGb,
      protectedDays,
    });
  };

  const isLoading = settingsQuery.isLoading || statusQuery.isLoading;
  const radarrAvailable = diskSpaceQuery.data?.available ?? false;
  const lastLog = lastLogQuery.data;
  const isCycleRunning = statusQuery.data?.isCycleRunning ?? false;

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      <PageHeader
        title="Rotation Settings"
        backHref="/media"
        breadcrumbs={[{ label: 'Media', href: '/media' }, { label: 'Rotation' }]}
        renderLink={Link}
      />

      <p className="text-sm text-muted-foreground">
        Configure how the library rotation system manages disk space by automatically cycling movies
        in and out.
      </p>

      {/* Master toggle */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Library Rotation</h2>
            <p className="text-sm text-muted-foreground">
              {enabled ? 'Rotation is active' : 'Rotation is disabled'}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={toggleMutation.isPending}
            aria-label="Toggle rotation"
          />
        </div>
      </div>

      {/* Schedule */}
      <fieldset className="rounded-lg border bg-card p-6 space-y-4" disabled={!enabled}>
        <h2 className="text-lg font-semibold">Schedule</h2>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Run schedule</Label>
            <Select
              value={schedulePreset}
              onChange={(e) => {
                setSchedulePreset(e.target.value);
                if (e.target.value !== 'custom') setCustomCron('');
              }}
              aria-label="Schedule preset"
              size="sm"
              options={SCHEDULE_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
            />
          </div>
          {schedulePreset === 'custom' && (
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Cron expression</Label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm font-mono shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={customCron}
                onChange={(e) => {
                  setCustomCron(e.target.value);
                }}
                placeholder="0 3 * * *"
              />
              <p className="text-xs text-muted-foreground">Standard 5-field cron syntax</p>
            </div>
          )}
          {statusQuery.data?.lastCycleAt && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Last run: {formatDate(statusQuery.data.lastCycleAt)}
            </p>
          )}
          {statusQuery.data?.nextRunAt && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Next run: {formatDate(statusQuery.data.nextRunAt)}
            </p>
          )}
        </div>
      </fieldset>

      {/* Numeric settings */}
      <fieldset className="rounded-lg border bg-card p-6 space-y-4" disabled={!enabled}>
        <h2 className="text-lg font-semibold">Parameters</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Leaving window (days)</Label>
            <NumberInput
              value={leavingDays}
              onChange={(e) => {
                setLeavingDays(Number(e.target.value) || 1);
              }}
              min={1}
              aria-label="Leaving window days"
            />
            <p className="text-xs text-muted-foreground">
              Days before a marked movie is actually removed
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Daily additions</Label>
            <NumberInput
              value={dailyAdditions}
              onChange={(e) => {
                setDailyAdditions(Number(e.target.value) || 1);
              }}
              min={1}
              aria-label="Daily additions"
            />
            <p className="text-xs text-muted-foreground">Max movies to add per rotation cycle</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Target free space (GB)</Label>
            <NumberInput
              value={targetFreeGb}
              onChange={(e) => {
                setTargetFreeGb(Number(e.target.value) || 0);
              }}
              min={0}
              aria-label="Target free space GB"
            />
            <p className="text-xs text-muted-foreground">
              Rotation maintains at least this much free disk space
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Average movie size (GB)</Label>
            <NumberInput
              value={avgMovieGb}
              onChange={(e) => {
                setAvgMovieGb(Number(e.target.value) || 1);
              }}
              min={1}
              aria-label="Average movie size GB"
            />
            <p className="text-xs text-muted-foreground">Estimated size for space calculations</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Protected days</Label>
            <NumberInput
              value={protectedDays}
              onChange={(e) => {
                setProtectedDays(Number(e.target.value) || 0);
              }}
              min={0}
              aria-label="Protected days"
            />
            <p className="text-xs text-muted-foreground">
              New additions are protected from removal for this many days
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={saveMutation.isPending || !enabled}
        >
          {saveMutation.isPending ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          Save Settings
        </Button>
      </fieldset>

      {/* Sources */}
      <SourceManagementSection />

      {/* Disk space */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Disk Space</h2>
        </div>
        {diskSpaceQuery.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : !radarrAvailable ? (
          <div className="flex items-center gap-2 text-sm text-amber-500">
            <AlertTriangle className="h-4 w-4" />
            Radarr unavailable — cannot read disk space
          </div>
        ) : (
          <div className="space-y-2">
            {diskSpaceQuery.data?.disks.map((disk) => {
              const usedPct =
                disk.totalSpace > 0
                  ? ((disk.totalSpace - disk.freeSpace) / disk.totalSpace) * 100
                  : 0;
              return (
                <div key={disk.path} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{disk.label || disk.path}</span>
                    <span>
                      {formatBytes(disk.freeSpace)} free / {formatBytes(disk.totalSpace)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${usedPct > 90 ? 'bg-destructive' : usedPct > 70 ? 'bg-amber-500' : 'bg-success'}`}
                      style={{ width: `${Math.min(usedPct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Last cycle summary */}
      {lastLog && (
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <h2 className="text-lg font-semibold">Last Rotation Run</h2>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Executed: </span>
              {formatDate(lastLog.executedAt)}
            </div>
            <div>
              <span className="text-muted-foreground">Free space: </span>
              {lastLog.freeSpaceGb.toFixed(1)} GB / {lastLog.targetFreeGb.toFixed(1)} GB target
            </div>
            <div>
              <span className="text-muted-foreground">Movies added: </span>
              {lastLog.moviesAdded}
            </div>
            <div>
              <span className="text-muted-foreground">Movies removed: </span>
              {lastLog.moviesRemoved}
            </div>
            <div>
              <span className="text-muted-foreground">Marked leaving: </span>
              {lastLog.moviesMarkedLeaving}
            </div>
            {lastLog.removalsFailed > 0 && (
              <div className="text-destructive/80">
                <span className="text-muted-foreground">Removals failed: </span>
                {lastLog.removalsFailed}
              </div>
            )}
            {lastLog.skippedReason && (
              <div className="col-span-full text-amber-500 text-xs">{lastLog.skippedReason}</div>
            )}
          </div>
        </div>
      )}

      {/* Rotation Log link */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Rotation Log</h2>
            <p className="text-sm text-muted-foreground">View full history of rotation cycles</p>
          </div>
          <Link to="/media/rotation/log">
            <Button variant="outline" size="sm">
              <ScrollText className="h-3.5 w-3.5 mr-1.5" />
              View Log
            </Button>
          </Link>
        </div>
      </div>

      {/* Run Now */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Manual Run</h2>
            <p className="text-sm text-muted-foreground">Trigger an immediate rotation cycle</p>
          </div>
          <Button
            onClick={() => {
              runNowMutation.mutate();
            }}
            disabled={!enabled || !radarrAvailable || runNowMutation.isPending || isCycleRunning}
          >
            {runNowMutation.isPending || isCycleRunning ? (
              <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1.5" />
            )}
            {runNowMutation.isPending || isCycleRunning ? 'Running...' : 'Run Now'}
          </Button>
        </div>
      </div>
    </div>
  );
}
