/**
 * useSyncJob — hook for managing background Plex sync jobs.
 *
 * Starts a job via mutation (returns immediately), polls for progress,
 * and auto-restores running jobs on mount (survives page navigation).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '../lib/trpc';

type SyncJobType =
  | 'syncMovies'
  | 'syncTvShows'
  | 'syncWatchlist'
  | 'syncWatchHistory'
  | 'syncDiscoverWatches';

interface SyncJobProgress {
  processed: number;
  total: number;
}

interface SyncJob {
  id: string;
  jobType: SyncJobType;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  progress: SyncJobProgress;
  result: unknown;
  error: string | null;
}

interface SyncJobParams {
  sectionId?: string;
  movieSectionId?: string;
  tvSectionId?: string;
}

interface UseSyncJobReturn {
  /** Start the sync job. */
  start: (params?: SyncJobParams) => void;
  /** Whether the start mutation is in flight. */
  isStarting: boolean;
  /** Whether a job is currently running. */
  isRunning: boolean;
  /** Current progress (processed/total). Null if not running. */
  progress: SyncJobProgress | null;
  /** Result object when completed. Null if not yet complete. */
  result: unknown;
  /** Error message if failed. Null otherwise. */
  error: string | null;
  /** Duration in ms of the completed job. */
  durationMs: number | null;
  /** The completed-at timestamp. */
  completedAt: string | null;
  /** Current job status. */
  status: 'idle' | 'running' | 'completed' | 'failed';
}

const JOB_TYPE_LABELS: Record<SyncJobType, string> = {
  syncMovies: 'Movie sync',
  syncTvShows: 'TV sync',
  syncWatchlist: 'Watchlist sync',
  syncWatchHistory: 'Watch history sync',
  syncDiscoverWatches: 'Cloud watch sync',
};

export function useSyncJob(jobType: SyncJobType): UseSyncJobReturn {
  const [jobId, setJobId] = useState<string | null>(null);
  const [restoredJob, setRestoredJob] = useState<SyncJob | null>(null);
  const restoredRef = useRef(false);
  const label = JOB_TYPE_LABELS[jobType];

  // On mount, check for any active job of this type to restore.
  // While this is loading, isRunning reflects the restore state so the
  // UI stays disabled and doesn't let the user start a duplicate job.
  const activeJobs = trpc.media.plex.getActiveSyncJobs.useQuery(undefined, {
    enabled: !jobId && !restoredRef.current,
    refetchOnWindowFocus: false,
  });
  const isRestoring = !restoredRef.current && !jobId && activeJobs.isLoading;

  useEffect(() => {
    if (restoredRef.current || jobId) return;
    if (!activeJobs.data?.data) return;
    restoredRef.current = true;

    const match = activeJobs.data.data.find(
      (j) => j.jobType === jobType && j.status === 'running'
    ) as SyncJob | undefined;
    if (match) {
      setJobId(match.id);
      // Immediately surface progress from the restore response
      // so the UI shows "15/700" before the first status poll arrives
      setRestoredJob(match);
    }
  }, [activeJobs.data?.data, jobId, jobType]);

  // Poll for job status while we have an active job ID
  const statusQuery = trpc.media.plex.getSyncJobStatus.useQuery(
    { jobId: jobId ?? '' },
    {
      enabled: !!jobId,
      refetchInterval: (query) => {
        const status = query.state.data?.data?.status;
        return status === 'running' ? 1500 : false;
      },
    }
  );

  // Clear restored snapshot once real polling data arrives
  useEffect(() => {
    if (statusQuery.data?.data && restoredJob) {
      setRestoredJob(null);
    }
  }, [statusQuery.data?.data, restoredJob]);

  const startMutation = trpc.media.plex.startSyncJob.useMutation({
    onSuccess: (res) => {
      setJobId(res.data.jobId);
    },
    onError: (err) => {
      toast.error(`Failed to start ${label}: ${err.message}`);
    },
  });

  // Show toast on completion/failure
  useEffect(() => {
    const job = statusQuery.data?.data;
    if (!job || !jobId) return;

    if (job.status === 'completed') {
      toast.success(`${label} complete`);
    } else if (job.status === 'failed') {
      toast.error(`${label} failed: ${job.error ?? 'Unknown error'}`);
    }
    // Only trigger on status transitions — not on every poll
  }, [statusQuery.data?.data?.status]);

  const start = useCallback(
    (params?: SyncJobParams) => {
      startMutation.mutate({ jobType, ...params });
    },
    [jobType, startMutation]
  );

  // Use polled data when available, otherwise the restored snapshot
  const job = (statusQuery.data?.data as SyncJob | undefined) ?? restoredJob;
  const isRunning = isRestoring || job?.status === 'running';

  return {
    start,
    isStarting: startMutation.isPending,
    isRunning,
    progress: isRunning ? (job?.progress ?? null) : null,
    result: job?.result ?? null,
    error: job?.status === 'failed' ? job.error : null,
    durationMs: job?.durationMs ?? null,
    completedAt: job?.completedAt ?? null,
    status: isRestoring ? 'running' : !job ? 'idle' : job.status,
  };
}

/** Hook to get "last synced" data for all sync types. */
export function useLastSyncResults(): Record<string, SyncJob | null> {
  const query = trpc.media.plex.getLastSyncResults.useQuery();
  return (query.data?.data ?? {}) as Record<string, SyncJob | null>;
}
