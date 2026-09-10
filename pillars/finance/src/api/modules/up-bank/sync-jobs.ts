/**
 * Process-local registry of Up sync jobs (POPS-2921).
 *
 * The scheduler and `POST /accounts/:id/sync` both come through here, so a
 * manual trigger during a scheduled pass gets the pass's own job back instead
 * of a second fetch of the same rows: one job per account at a time, keyed on
 * the account. Finished jobs stay pollable for a while and then go — the
 * durable record is the `import_batches` row the sync wrote, the job is only
 * the handle a `Sync now` button polls.
 *
 * The range a job asks for is derived, not chosen: from the account's newest
 * transaction less a two-day overlap (Up back-dates a settlement to when the
 * purchase happened, so the days just before the newest row can still gain
 * rows) up to today. An account with no rows yet looks back ninety days.
 */
import { randomUUID } from 'node:crypto';

import { importDraftsService, importStatusFor, today, type FinanceDb } from '../../../db/index.js';
import { syncUpAccount, type UpSyncResult } from './sync.js';

import type {
  UpSyncJob,
  UpSyncJobResult,
  UpSyncTrigger,
} from '../../../contract/rest-account-sync-schemas.js';
import type { ContactsClient } from '../../contacts/client.js';
import type { UpSyncArgs } from './sync-plan.js';
import type { UpBankClient } from './up-api.js';

export type { UpSyncJob, UpSyncJobResult, UpSyncTrigger };

/** The pass a job runs; `syncUpAccount` unless a test swaps it. */
export type UpSyncRunner = (
  db: FinanceDb,
  contacts: ContactsClient,
  args: UpSyncArgs
) => Promise<UpSyncResult>;

const OVERLAP_DAYS = 2;
const FIRST_SYNC_LOOKBACK_DAYS = 90;
const JOB_TTL_MS = 30 * 60 * 1000;

let runner: UpSyncRunner = syncUpAccount;

/** Test seam: swap the pass; pass null to restore `syncUpAccount`. */
export function setUpSyncRunnerForTests(impl: UpSyncRunner | null): void {
  runner = impl ?? syncUpAccount;
}

const jobs = new Map<string, UpSyncJob>();
const expiry = new Map<string, NodeJS.Timeout>();
const inFlight = new Map<string, { job: UpSyncJob; done: Promise<UpSyncJob> }>();

function shiftDay(date: string, days: number): string {
  const stamp = new Date(`${date}T00:00:00Z`);
  stamp.setUTCDate(stamp.getUTCDate() + days);
  return stamp.toISOString().slice(0, 10);
}

/** The inclusive date range a sync of this account should ask Up for, ending `asOf`. */
/**
 * The range the next pass asks Up for: from two days before the newest row
 * the account knows about, in the ledger or waiting in one of its drafts
 * (finance ADR-005), or ninety days back for an account with neither. The
 * overlap is harmless because staging dedups against both.
 */
export function syncRangeFor(
  db: FinanceDb,
  accountId: string,
  asOf: string = today()
): { from: string; to: string } {
  const inLedger = importStatusFor(db, [accountId]).get(accountId)?.newestTransactionDate ?? null;
  const inDrafts = importDraftsService
    .listImportDrafts(db, { accountId })
    .map((draft) => draft.dateTo)
    .filter((date): date is string => date !== null)
    .toSorted()
    .at(-1);
  const newest =
    [inLedger, inDrafts ?? null]
      .filter((date): date is string => date !== null)
      .toSorted()
      .at(-1) ?? null;
  const from =
    newest === null ? shiftDay(asOf, -FIRST_SYNC_LOOKBACK_DAYS) : shiftDay(newest, -OVERLAP_DAYS);
  return { from: from < asOf ? from : asOf, to: asOf };
}

function snapshot(job: UpSyncJob): UpSyncJob {
  return { ...job, result: job.result ? { ...job.result } : null };
}

function armExpiry(jobId: string): void {
  const timer = setTimeout(() => {
    jobs.delete(jobId);
    expiry.delete(jobId);
  }, JOB_TTL_MS);
  timer.unref?.();
  expiry.set(jobId, timer);
}

function toJobResult(result: UpSyncResult): UpSyncJobResult {
  return {
    fetched: result.fetched,
    staged: result.staged,
    alreadyStaged: result.alreadyStaged,
    alreadyInLedger: result.alreadyInLedger,
    settled: result.settled,
    settleRefused: result.settleRefused,
    alreadyHeld: result.alreadyHeld,
    draftId: result.draftId,
    warnings: result.warnings.map((w) => `${w.type}: ${w.details ?? w.message}`),
  };
}

async function run(
  db: FinanceDb,
  contacts: ContactsClient,
  job: UpSyncJob,
  client: UpBankClient | undefined
): Promise<void> {
  try {
    const result = await runner(db, contacts, {
      accountId: job.accountId,
      from: job.from,
      to: job.to,
      asOf: job.to,
      ...(client ? { client } : {}),
    });
    job.result = toJobResult(result);
    job.status = 'completed';
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
  }
  job.finishedAt = new Date().toISOString();
}

export interface StartUpSyncInput {
  accountId: string;
  trigger: UpSyncTrigger;
  /** Injected by tests; built from the account's secret otherwise. */
  client?: UpBankClient;
  /** The day the range ends; today unless a test says otherwise. */
  asOf?: string;
}

export interface StartedUpSync {
  job: UpSyncJob;
  /** Resolves to the finished job, whichever way it finished. */
  done: Promise<UpSyncJob>;
  /** True when a job for the account was already running and is the one returned. */
  reused: boolean;
}

/** Start a sync for the account, or hand back the one already running. */
export function startUpSyncJob(
  db: FinanceDb,
  contacts: ContactsClient,
  input: StartUpSyncInput
): StartedUpSync {
  const current = inFlight.get(input.accountId);
  if (current) return { job: snapshot(current.job), done: current.done, reused: true };

  const asOf = input.asOf ?? today();
  const job: UpSyncJob = {
    id: randomUUID(),
    accountId: input.accountId,
    trigger: input.trigger,
    status: 'running',
    ...syncRangeFor(db, input.accountId, asOf),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null,
  };
  jobs.set(job.id, job);
  const done = run(db, contacts, job, input.client).then(() => {
    inFlight.delete(job.accountId);
    armExpiry(job.id);
    return snapshot(job);
  });
  inFlight.set(job.accountId, { job, done });
  return { job: snapshot(job), done, reused: false };
}

/** The job as it stands, or null once it has expired or never existed. */
export function getUpSyncJob(jobId: string): UpSyncJob | null {
  const job = jobs.get(jobId);
  return job ? snapshot(job) : null;
}

/** Forget every job and its expiry; used by tests only. */
export function clearUpSyncJobs(): void {
  for (const timer of expiry.values()) clearTimeout(timer);
  expiry.clear();
  jobs.clear();
  inFlight.clear();
}
