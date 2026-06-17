/**
 * In-process periodic Plex sync scheduler (slice 9c).
 *
 * Re-architected from the monolith's BullMQ repeatable job to a recursive
 * `setTimeout` driven by a MODULE-LEVEL singleton controller, so the
 * `server.ts` boot path and the `POST /plex/scheduler/{start,stop}` REST
 * handlers all drive the SAME timer. Mirrors the finance pillar's
 * `startReconcileCrossPillarWorker` recursive-arm pattern (the next tick is
 * armed only AFTER the current one resolves — no pile-up), and fires one
 * tick immediately on start.
 *
 * Persisted state lives in `plex_settings` (`plex_scheduler_enabled` +
 * `plex_scheduler_interval_ms`); `resumeIfEnabled` reads it on boot.
 *
 * Gate: a tick runs ONLY movies / tv / watchlist sync. The Plex Discover
 * watch sync is deferred to wave 3 — see `plex-scheduler-tick.ts`.
 */
import { type MediaDb, plexSettingsService } from '../../db/index.js';
import { getLastSyncAt, getLastSyncCounts, getLastSyncError } from '../../db/services/sync-logs.js';
import { PLEX_KEYS } from '../clients/plex/keys.js';
import { runPlexSyncTick } from './plex-scheduler-tick.js';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

export interface PlexSchedulerStatus {
  isRunning: boolean;
  intervalMs: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  nextSyncAt: string | null;
  moviesSynced: number;
  tvShowsSynced: number;
}

export interface PlexSchedulerStartOptions {
  db: MediaDb;
  intervalMs?: number;
  movieSectionId?: string;
  tvSectionId?: string;
}

interface SchedulerState {
  db: MediaDb;
  intervalMs: number;
  movieSectionId?: string;
  tvSectionId?: string;
  timer: NodeJS.Timeout | undefined;
}

let state: SchedulerState | null = null;
let nextSyncAt: string | null = null;

function persistEnabled(db: MediaDb, intervalMs: number): void {
  plexSettingsService.setSetting(db, PLEX_KEYS.schedulerEnabled, 'true');
  plexSettingsService.setSetting(db, PLEX_KEYS.schedulerIntervalMs, String(intervalMs));
}

function persistDisabled(db: MediaDb): void {
  plexSettingsService.setSetting(db, PLEX_KEYS.schedulerEnabled, 'false');
}

interface TickArgs {
  movieSectionId?: string;
  tvSectionId?: string;
}

async function runOnce(db: MediaDb, args: TickArgs): Promise<void> {
  await runPlexSyncTick(db, {
    movieSectionId: args.movieSectionId,
    tvSectionId: args.tvSectionId,
  });
}

function arm(): void {
  if (state === null) return;
  const current = state;
  nextSyncAt = new Date(Date.now() + current.intervalMs).toISOString();
  current.timer = setTimeout(() => {
    void tick();
  }, current.intervalMs);
}

async function tick(): Promise<void> {
  if (state === null) return;
  const current = state;
  try {
    await runOnce(current.db, {
      movieSectionId: current.movieSectionId,
      tvSectionId: current.tvSectionId,
    });
  } catch (err) {
    console.warn('[media-api] plex scheduler tick failed', err);
  }
  arm();
}

export const plexScheduler = {
  /**
   * Arm the recursive timer and fire one tick immediately. Idempotent: a
   * second `start` while running clears the prior timer and re-arms with the
   * new options. Persists the enabled flag + interval to `plex_settings`.
   */
  start(options: PlexSchedulerStartOptions): PlexSchedulerStatus {
    if (state?.timer !== undefined) clearTimeout(state.timer);
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    state = {
      db: options.db,
      intervalMs,
      movieSectionId: options.movieSectionId,
      tvSectionId: options.tvSectionId,
      timer: undefined,
    };
    persistEnabled(options.db, intervalMs);
    void tick();
    return plexScheduler.status(options.db);
  },

  /** Clear the timer and persist the disabled flag. No-op if not running. */
  stop(): void {
    if (state === null) return;
    const { db, timer } = state;
    if (timer !== undefined) clearTimeout(timer);
    persistDisabled(db);
    state = null;
    nextSyncAt = null;
  },

  /** Run a single sync tick directly (no timer). Persists a sync log. */
  async runOnce(db: MediaDb): Promise<void> {
    await runOnce(db, {});
  },

  /** Read persisted state; start with the persisted interval if enabled. */
  resumeIfEnabled(db: MediaDb): PlexSchedulerStatus | null {
    const enabled = plexSettingsService.getSetting(db, PLEX_KEYS.schedulerEnabled);
    if (enabled !== 'true') return null;
    const raw = plexSettingsService.getSetting(db, PLEX_KEYS.schedulerIntervalMs);
    const parsed = raw === null ? NaN : Number(raw);
    const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
    return plexScheduler.start({ db, intervalMs });
  },

  status(db: MediaDb): PlexSchedulerStatus {
    const counts = getLastSyncCounts(db);
    return {
      isRunning: state !== null,
      intervalMs: state?.intervalMs ?? DEFAULT_INTERVAL_MS,
      lastSyncAt: getLastSyncAt(db),
      lastSyncError: getLastSyncError(db),
      nextSyncAt,
      moviesSynced: counts.moviesSynced,
      tvShowsSynced: counts.tvShowsSynced,
    };
  },

  /** Reset all in-memory state — for tests only. */
  _reset(): void {
    if (state?.timer !== undefined) clearTimeout(state.timer);
    state = null;
    nextSyncAt = null;
  },
};
