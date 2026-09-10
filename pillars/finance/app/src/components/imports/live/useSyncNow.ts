import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  accountImportsGetSyncJob,
  type AccountImportsGetSyncJobResponses,
  accountImportsTriggerSync,
} from '../../../finance-api/index.js';
import { IMPORT_DRAFTS_LIST_KEY } from '../hooks/useDraftWriteThrough';

type UpSyncJob = AccountImportsGetSyncJobResponses[200]['data'];

const POLL_MS = 1000;
const MAX_POLLS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJob(accountId: string, jobId: string): Promise<UpSyncJob> {
  for (let i = 0; i < MAX_POLLS; i += 1) {
    const job = unwrap(await accountImportsGetSyncJob({ path: { id: accountId, jobId } })).data;
    if (job.status !== 'running') return job;
    await sleep(POLL_MS);
  }
  throw new Error('The sync is taking longer than expected. Check back in a minute.');
}

/**
 * Start a sync for an Up account and follow it to its result (POPS-3335).
 * The rows it fetches wait in the account's pending draft (finance ADR-005),
 * so the list of drafts is invalidated when it lands, whatever it found.
 */
export function useSyncNow(accountId: string) {
  const queryClient = useQueryClient();
  const [job, setJob] = useState<UpSyncJob | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const started = unwrap(await accountImportsTriggerSync({ path: { id: accountId } })).data;
      return pollJob(accountId, started.id);
    },
    onSuccess: (finished) => {
      setJob(finished);
      void queryClient.invalidateQueries({ queryKey: IMPORT_DRAFTS_LIST_KEY });
    },
  });
  return {
    syncNow: () => mutation.mutate(),
    isSyncing: mutation.isPending,
    lastJob: job,
    error: mutation.error,
  };
}
