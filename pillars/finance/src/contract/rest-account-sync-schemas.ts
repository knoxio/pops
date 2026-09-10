/**
 * The wire shape of one Up sync job (POPS-2921): what `POST /accounts/:id/sync`
 * hands back and `GET /accounts/:id/sync/:jobId` is polled for. A job is
 * process-local and short-lived — it exists so `Sync now` has something to
 * poll, not as a record; the durable record of what a sync did is the
 * `import_batches` row it writes.
 */
import { z } from 'zod';

export const UP_SYNC_TRIGGERS = ['schedule', 'manual'] as const;
export type UpSyncTrigger = (typeof UP_SYNC_TRIGGERS)[number];

export const UP_SYNC_JOB_STATUSES = ['running', 'completed', 'failed'] as const;
export type UpSyncJobStatus = (typeof UP_SYNC_JOB_STATUSES)[number];

export const UpSyncJobResultSchema = z.object({
  /** Rows Up returned for the fetched range, before dedup. */
  fetched: z.number().int().nonnegative(),
  /** Rows this pass added to the account's pending draft (finance ADR-005); nothing reaches the ledger until it is committed. */
  staged: z.number().int().nonnegative(),
  /** Rows the pending draft already held. */
  alreadyStaged: z.number().int().nonnegative(),
  /** Rows already in the ledger: fetched, not staged. */
  alreadyInLedger: z.number().int().nonnegative(),
  /** Held rows already stored that this pass marked settled. */
  settled: z.number().int().nonnegative(),
  /**
   * Held rows a settlement would have turned into a positive `purchase`, so it
   * was refused (POPS-2685). They keep their pending flag and reappear under
   * `alreadyHeld` next pass; a figure that stays above zero across syncs is a
   * row that needs a person, not a transient.
   *
   * Optional so a job result serialised before this field existed still parses.
   */
  settleRefused: z.number().int().nonnegative().optional(),
  /** Held rows already stored and still held: fetched, not written. */
  alreadyHeld: z.number().int().nonnegative(),
  /** The pending draft the rows wait in; null when nothing was staged and none existed. */
  draftId: z.string().nullable(),
  warnings: z.array(z.string()),
});

export type UpSyncJobResult = z.infer<typeof UpSyncJobResultSchema>;

export const UpSyncJobSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  trigger: z.enum(UP_SYNC_TRIGGERS),
  status: z.enum(UP_SYNC_JOB_STATUSES),
  /** Inclusive `YYYY-MM-DD` range the job asked Up for. */
  from: z.string(),
  to: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  result: UpSyncJobResultSchema.nullable(),
  /** Why a `failed` job failed, as the operator should read it; never a token. */
  error: z.string().nullable(),
});

export type UpSyncJob = z.infer<typeof UpSyncJobSchema>;
