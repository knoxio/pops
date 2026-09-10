/**
 * Scheduled Up Bank sync for the finance pillar (POPS-2921).
 *
 * Same shape as the other finance workers: a recursive `setTimeout`, armed
 * again only after the current pass returns, so passes never pile up. Every
 * pass re-reads the two settings it is governed by, which is what makes the
 * toggle live without a restart: while off, the worker wakes once a minute to
 * look at the flag and does nothing else; once on, it runs every account fed
 * by the Up API through the same job registry `Sync now` uses, then sleeps
 * for the configured interval.
 *
 * `stop()` clears the timer and WAITS for the pass in flight, so a SIGTERM
 * lets a half-done sync commit its batch rather than leaving a fetch with no
 * record. It never touches the enabled flag — the schedule is an operator's
 * decision, and a restart is not.
 *
 * An account whose secret is missing fails its own job and is logged once per
 * pass; the other accounts still sync. The pass is sequential on purpose: Up
 * is one API key with one rate limit, and the accounts are few.
 */
import { getBulk } from '@pops/pillar-settings/service';

import { financeKeyDefaults } from '../../contract/settings/key-defaults.js';
import {
  UP_SYNC_DEFAULT_ENABLED,
  UP_SYNC_DEFAULT_INTERVAL_MINUTES,
  UP_SYNC_ENABLED_KEY,
  UP_SYNC_INTERVAL_KEY,
} from '../../contract/settings/up-sync-keys.js';
import { accountImportConfigService, type FinanceDb } from '../../db/index.js';
import { startUpSyncJob, type UpSyncJob } from '../modules/up-bank/sync-jobs.js';

import type { ContactsClient } from '../contacts/client.js';

const MINUTE_MS = 60 * 1000;
const DISABLED_POLL_MS = MINUTE_MS;

export interface UpSyncSettings {
  enabled: boolean;
  intervalMs: number;
}

/** The scheduler's two settings, each falling back to its manifest default and then to the compiled one. */
export function readUpSyncSettings(db: FinanceDb): UpSyncSettings {
  const stored = getBulk(db, [UP_SYNC_ENABLED_KEY, UP_SYNC_INTERVAL_KEY]);
  const enabledRaw =
    stored[UP_SYNC_ENABLED_KEY] ??
    financeKeyDefaults.defaults[UP_SYNC_ENABLED_KEY] ??
    String(UP_SYNC_DEFAULT_ENABLED);
  const minutes = Number(
    stored[UP_SYNC_INTERVAL_KEY] ??
      financeKeyDefaults.defaults[UP_SYNC_INTERVAL_KEY] ??
      UP_SYNC_DEFAULT_INTERVAL_MINUTES
  );
  const safeMinutes =
    Number.isFinite(minutes) && minutes > 0 ? minutes : UP_SYNC_DEFAULT_INTERVAL_MINUTES;
  return { enabled: enabledRaw === 'true', intervalMs: safeMinutes * MINUTE_MS };
}

export interface UpSyncSchedulerLogger {
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface UpSyncSchedulerOptions {
  db: FinanceDb;
  contacts: ContactsClient;
  logger?: UpSyncSchedulerLogger;
  /** How long the worker sleeps before its first pass, and between looks at a disabled flag. */
  disabledPollMs?: number;
  readSettings?: (db: FinanceDb) => UpSyncSettings;
}

export interface UpSyncTickStats {
  /** False when the flag was off and the pass did nothing. */
  enabled: boolean;
  /** Accounts fed by the Up API, whether or not their sync succeeded. */
  accounts: number;
  synced: number;
  failed: number;
}

export interface UpSyncSchedulerHandle {
  /** Clear the timer and wait for a pass in flight to finish. */
  stop: () => Promise<void>;
  /** Run one pass now, regardless of the timer; exposed for tests and a boot-time catch-up. */
  runOnce: () => Promise<UpSyncTickStats>;
}

interface PassContext {
  db: FinanceDb;
  contacts: ContactsClient;
  logger: UpSyncSchedulerLogger | undefined;
  readSettings: (db: FinanceDb) => UpSyncSettings;
}

function recordOutcome(
  job: UpSyncJob,
  stats: UpSyncTickStats,
  logger?: UpSyncSchedulerLogger
): void {
  if (job.status === 'completed') {
    stats.synced += 1;
    logger?.info?.('finance up sync complete', {
      accountId: job.accountId,
      staged: job.result?.staged,
      settled: job.result?.settled,
      draftId: job.result?.draftId,
    });
    return;
  }
  stats.failed += 1;
  logger?.warn?.('finance up sync skipped', { accountId: job.accountId, error: job.error });
}

async function runPass(ctx: PassContext): Promise<UpSyncTickStats> {
  const settings = ctx.readSettings(ctx.db);
  const stats: UpSyncTickStats = { enabled: settings.enabled, accounts: 0, synced: 0, failed: 0 };
  if (!settings.enabled) return stats;

  for (const config of accountImportConfigService.listImportConfigsByProvider(ctx.db, 'up')) {
    stats.accounts += 1;
    const job = await startUpSyncJob(ctx.db, ctx.contacts, {
      accountId: config.accountId,
      trigger: 'schedule',
    }).done;
    recordOutcome(job, stats, ctx.logger);
  }
  ctx.logger?.info?.('finance up sync pass complete', { ...stats });
  return stats;
}

export function startUpSyncScheduler(options: UpSyncSchedulerOptions): UpSyncSchedulerHandle {
  const ctx: PassContext = {
    db: options.db,
    contacts: options.contacts,
    logger: options.logger,
    readSettings: options.readSettings ?? readUpSyncSettings,
  };
  const disabledPollMs = options.disabledPollMs ?? DISABLED_POLL_MS;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  function arm(delayMs: number): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick();
    }, delayMs);
  }

  async function tick(): Promise<void> {
    let delayMs = disabledPollMs;
    inFlight = runPass(ctx)
      .then((stats) => {
        if (stats.enabled) delayMs = ctx.readSettings(ctx.db).intervalMs;
      })
      .catch((err: unknown) => {
        ctx.logger?.warn?.('finance up sync pass failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    await inFlight;
    inFlight = null;
    arm(delayMs);
  }

  arm(disabledPollMs);

  return {
    stop: async (): Promise<void> => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      if (inFlight !== null) await inFlight;
    },
    runOnce: () => runPass(ctx),
  };
}
