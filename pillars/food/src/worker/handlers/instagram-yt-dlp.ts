/**
 * yt-dlp spawn wrapper + stderr classifiers.
 *
 * Split out of `instagram-acquisition.ts` to keep that file's
 * orchestration logic small. The classifiers are pure and easy to test
 * with sample stderr strings; the spawn wrapper is the only piece that
 * actually touches a child process.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

export const DEFAULT_YT_DLP_TIMEOUT_MS = 60_000;
export const DEFAULT_RATE_LIMIT_FALLBACK_SEC = 300;
/** Grace period between SIGTERM and SIGKILL. Bounded so a misbehaving
 *  yt-dlp can't stall a BullMQ worker slot. */
export const DEFAULT_SIGKILL_GRACE_MS = 5_000;
const DEFAULT_MAX_FILESIZE = '100M';
const DEFAULT_SOCKET_TIMEOUT = '30';
const DEFAULT_YT_DLP_RETRIES = '2';

export interface RunYtDlpOptions {
  url: string;
  cookiesPath: string;
  output: string;
  timeoutMs?: number;
  /** Grace period between SIGTERM and SIGKILL when a kill is forced
   *  (timeout or signal abort). Defaults to `DEFAULT_SIGKILL_GRACE_MS`. */
  sigkillGraceMs?: number;
  /** Test seam — defaults to `spawn` from `node:child_process`. */
  spawnFn?: typeof spawn;
  /** Aborts the child process when fired. The handler uses this to wire
   *  cooperative cancellation through to a running yt-dlp child. */
  signal?: AbortSignal;
}

export interface YtDlpResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function buildYtDlpArgs(opts: RunYtDlpOptions): string[] {
  return [
    '--cookies',
    opts.cookiesPath,
    '--write-info-json',
    '--write-thumbnail',
    '--no-playlist',
    '--format',
    'best[ext=mp4]/best',
    '--max-filesize',
    DEFAULT_MAX_FILESIZE,
    '--output',
    join(opts.output, '%(id)s.%(ext)s'),
    '--socket-timeout',
    DEFAULT_SOCKET_TIMEOUT,
    '--retries',
    DEFAULT_YT_DLP_RETRIES,
    opts.url,
  ];
}

interface KillSwitch {
  forceKill: () => void;
  clear: () => void;
}

/**
 * Returns a forceful-termination helper that escalates SIGTERM →
 * SIGKILL after `graceMs`. Idempotent: the second `forceKill()` call
 * is a no-op while the SIGKILL timer is still armed. `clear()` cancels
 * a pending SIGKILL when the child exits cleanly first.
 */
function makeKillSwitch(
  child: import('node:child_process').ChildProcess,
  graceMs: number
): KillSwitch {
  let sigkillTimer: NodeJS.Timeout | null = null;
  return {
    forceKill: () => {
      if (sigkillTimer != null) return;
      child.kill('SIGTERM');
      sigkillTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, graceMs);
    },
    clear: () => {
      if (sigkillTimer != null) {
        clearTimeout(sigkillTimer);
        sigkillTimer = null;
      }
    },
  };
}

/**
 * Spawns yt-dlp with the pinned flags and captures stdout/stderr.
 * Returns `exitCode=-1` whenever the child is terminated by a signal
 * (timeout SIGTERM/SIGKILL or abort-signal kill) — use `timedOut` to
 * distinguish a timeout from an external abort. On a clean exit the
 * real exit code is preserved verbatim.
 *
 * A SIGTERM is always followed by a SIGKILL after `sigkillGraceMs` so a
 * misbehaving yt-dlp can never stall a BullMQ worker slot indefinitely.
 */
export async function runYtDlp(opts: RunYtDlpOptions): Promise<YtDlpResult> {
  const spawnImpl = opts.spawnFn ?? spawn;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_YT_DLP_TIMEOUT_MS;
  const sigkillGraceMs = opts.sigkillGraceMs ?? DEFAULT_SIGKILL_GRACE_MS;

  return new Promise<YtDlpResult>((resolve, reject) => {
    const child = spawnImpl('yt-dlp', buildYtDlpArgs(opts), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const kill = makeKillSwitch(child, sigkillGraceMs);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      kill.forceKill();
    }, timeoutMs);
    const onAbort = (): void => kill.forceKill();
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    const cleanup = (): void => {
      clearTimeout(timer);
      kill.clear();
      opts.signal?.removeEventListener('abort', onAbort);
    };

    child.on('error', (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
    child.on('close', (code, sig) => {
      cleanup();
      const exitCode = code ?? (sig != null ? -1 : 0);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });
}

/**
 * Best-effort match against yt-dlp's auth-failure error strings. The
 * patterns are intentionally generous — yt-dlp's exact wording changes
 * between releases; adding new ones is a small PR and surfaces in the
 * runbook so an operator can shortcut the diagnosis.
 */
const AUTH_DEAD_PATTERNS: readonly RegExp[] = [
  /login required/i,
  /Please log in/i,
  /Restricted Video.*log in/i,
  /Login cookies.*invalid/i,
  /authentication.*required/i,
  /This account is private/i,
];

export function isAuthDead(stderr: string): boolean {
  return AUTH_DEAD_PATTERNS.some((pattern) => pattern.test(stderr));
}

const RATE_LIMIT_PATTERNS: readonly RegExp[] = [
  /HTTP Error 429/i,
  /Too Many Requests/i,
  /rate.?limit/i,
];

const RETRY_AFTER_PATTERN = /Retry-After:\s*(\d+)/i;

export interface RateLimitMatch {
  matched: boolean;
  retryAfter: number;
}

/**
 * Returns the recommended retry delay in seconds when yt-dlp surfaces a
 * 429 / "Too Many Requests" string. Honours `Retry-After` when present;
 * otherwise falls back to 300 s — Instagram rate limits are global per
 * IP and retrying soon would just burn another attempt.
 */
export function isRateLimited(stderr: string): RateLimitMatch {
  const matched = RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(stderr));
  if (!matched) return { matched: false, retryAfter: 0 };
  const header = RETRY_AFTER_PATTERN.exec(stderr);
  const headerValue = header?.[1];
  if (headerValue != null) {
    const parsed = Number.parseInt(headerValue, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return { matched: true, retryAfter: parsed };
    }
  }
  return { matched: true, retryAfter: DEFAULT_RATE_LIMIT_FALLBACK_SEC };
}
