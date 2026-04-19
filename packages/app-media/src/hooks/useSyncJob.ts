/**
 * useSyncJob — hook for managing background Plex sync jobs.
 *
 * Starts a job via mutation (returns immediately), polls for progress,
 * and auto-restores running jobs on mount (survives page navigation).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

type SyncJobType =
  | 'plexSyncMovies'
  | 'plexSyncTvShows'
  | 'plexSyncWatchlist'
  | 'plexSyncWatchHistory'
  | 'plexSyncDiscoverWatches';

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
  plexSyncMovies: 'Movie sync',
  plexSyncTvShows: 'TV sync',
  plexSyncWatchlist: 'Watchlist sync',
  plexSyncWatchHistory: 'Watch history sync',
  plexSyncDiscoverWatches: 'Cloud watch sync',
};

function useRestoreActiveJob(
  jobType: SyncJobType,
  jobId: string | null,
  setJobId: (id: string) => void,
  setRestoredJob: (j: SyncJob) => void
) {
  const restoredRef = useRef(false);
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
      setRestoredJob(match);
    }
  }, [activeJobs.data?.data, jobId, jobType, setJobId, setRestoredJob]);

  return { isRestoring };
}

function useStatusPolling(
  jobId: string | null,
  restoredJob: SyncJob | null,
  clearRestored: () => void
) {
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

  useEffect(() => {
    if (statusQuery.data?.data && restoredJob) {
      clearRestored();
    }
  }, [statusQuery.data?.data, restoredJob, clearRestored]);

  return statusQuery;
}

function useCompletionToast(label: string, jobId: string | null, statusData: SyncJob | undefined) {
  useEffect(() => {
    if (!statusData || !jobId) return;
    if (statusData.status === 'completed') {
      toast.success(`${label} complete`);
    } else if (statusData.status === 'failed') {
      toast.error(`${label} failed: ${statusData.error ?? 'Unknown error'}`);
    }
  }, [statusData?.status, jobId, label, statusData]);
}

function deriveStatus(
  isRestoring: boolean,
  job: SyncJob | undefined | null
): UseSyncJobReturn['status'] {
  if (isRestoring) return 'running';
  if (!job) return 'idle';
  return job.status;
}

function buildReturnState(
  job: SyncJob | undefined | null,
  isRunning: boolean
): Pick<UseSyncJobReturn, 'progress' | 'result' | 'error' | 'durationMs' | 'completedAt'> {
  return {
    progress: isRunning ? (job?.progress ?? null) : null,
    result: job?.result ?? null,
    error: job?.status === 'failed' ? job.error : null,
    durationMs: job?.durationMs ?? null,
    completedAt: job?.completedAt ?? null,
  };
}

export function useSyncJob(jobType: SyncJobType): UseSyncJobReturn {
  const [jobId, setJobId] = useState<string | null>(null);
  const [restoredJob, setRestoredJob] = useState<SyncJob | null>(null);
  const label = JOB_TYPE_LABELS[jobType];

  const { isRestoring } = useRestoreActiveJob(jobType, jobId, setJobId, setRestoredJob);
  const statusQuery = useStatusPolling(jobId, restoredJob, () => setRestoredJob(null));

  const startMutation = trpc.media.plex.startSyncJob.useMutation({
    onSuccess: (res) => {
      setJobId(res.data.jobId);
    },
    onError: (err) => {
      toast.error(`Failed to start ${label}: ${err.message}`);
    },
  });

  useCompletionToast(label, jobId, statusQuery.data?.data as SyncJob | undefined);

  const start = useCallback(
    (params?: SyncJobParams) => {
      startMutation.mutate({ jobType, ...params });
    },
    [jobType, startMutation]
  );

  const job = (statusQuery.data?.data as SyncJob | undefined) ?? restoredJob;
  const isRunning = isRestoring || job?.status === 'running';

  return {
    start,
    isStarting: startMutation.isPending,
    isRunning,
    ...buildReturnState(job, isRunning),
    status: deriveStatus(isRestoring, job),
  };
}

/** Hook to get "last synced" data for all sync types. */
export function useLastSyncResults(): Record<string, SyncJob | null> {
  const query = trpc.media.plex.getLastSyncResults.useQuery();
  return (query.data?.data ?? {}) as Record<string, SyncJob | null>;
}
