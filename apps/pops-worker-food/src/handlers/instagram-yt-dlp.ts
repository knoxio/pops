/**
 * PRD-129 — yt-dlp spawn wrapper + stderr classifiers.
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
const DEFAULT_MAX_FILESIZE = '100M';
const DEFAULT_SOCKET_TIMEOUT = '30';
const DEFAULT_YT_DLP_RETRIES = '2';

export interface RunYtDlpOptions {
  url: string;
  cookiesPath: string;
  output: string;
  timeoutMs?: number;
  /** Test seam — defaults to `spawn` from `node:child_process`. */
  spawnFn?: typeof spawn;
  /** Aborts the child process when fired (test seam for cancellation). */
  signal?: AbortSignal;
}

export interface YtDlpResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Spawns yt-dlp with PRD-129's pinned flags and captures stdout/stderr.
 * Returns `exitCode=-1` when the process is killed by an abort signal
 * so callers can distinguish that from a normal failure.
 */
export async function runYtDlp(opts: RunYtDlpOptions): Promise<YtDlpResult> {
  const spawnImpl = opts.spawnFn ?? spawn;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_YT_DLP_TIMEOUT_MS;

  const args = [
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

  return new Promise<YtDlpResult>((resolve, reject) => {
    const child = spawnImpl('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    const onAbort = (): void => {
      child.kill('SIGTERM');
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.on('error', (err) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      reject(err instanceof Error ? err : new Error(String(err)));
    });

    child.on('close', (code, sig) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
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
