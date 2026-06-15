/**
 * PRD-129 — Instagram acquisition (yt-dlp + cookies).
 *
 * Downloads a single Instagram reel by spawning the pinned `yt-dlp` from
 * the worker container (PRD-126's runtime stage) with a cookie file
 * mounted in by the operator. Returns a structured `AcquisitionResult`
 * the PRD-130 STT/vision pipeline can consume directly; on failure it
 * carries enough information for the worker shell to either delay-retry
 * (rate-limited) or surface a partial draft (auth-dead) without burning
 * BullMQ retries on hopeless attempts.
 *
 * Cancellation is cooperative: cheap checks before and after spawn,
 * SIGTERM + workdir cleanup mid-spawn.
 */
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { isAuthDead, isRateLimited, runYtDlp } from './instagram-yt-dlp.js';

import type { IngestJobData } from '../../contract/queue/index.js';
import type { YtDlpResult } from './instagram-yt-dlp.js';
import type { HandlerContext } from './types.js';

/** Discriminated union returned by `runInstagramAcquisition`. */
export type AcquisitionResult =
  | {
      ok: true;
      workDir: string;
      videoPath: string;
      infoJsonPath: string;
      thumbnailPath: string | null;
      caption: string | null;
    }
  | { ok: false; kind: 'auth-dead'; stderr: string }
  | { ok: false; kind: 'rate-limited'; retryAfter: number }
  | { ok: false; kind: 'generic-failure'; exitCode: number; stderr: string }
  | { ok: false; kind: 'missing-artifacts' }
  | { ok: false; kind: 'cancelled' };

/**
 * Reads the `description` field out of yt-dlp's `*.info.json` artefact.
 * Returns `null` when the file lacks a description or the JSON parse
 * fails — callers treat that as "no caption available" rather than a
 * hard error (PRD-130 routes to STT + vision in that case).
 */
export async function readCaption(infoJsonPath: string): Promise<string | null> {
  try {
    const raw = await readFile(infoJsonPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed != null && typeof parsed === 'object' && 'description' in parsed) {
      const description = (parsed as { description: unknown }).description;
      if (typeof description === 'string' && description.trim().length > 0) {
        return description;
      }
    }
  } catch {
    // ENOENT / invalid JSON / parse error all mean "no caption" — the
    // worker shell still has the video bytes to fall back on.
  }
  return null;
}

const VIDEO_EXT_RE = /\.mp4$/i;
const INFO_JSON_RE = /\.info\.json$/i;
const THUMBNAIL_RE = /\.(jpg|jpeg|png|webp)$/i;

async function firstMatch(dir: string, pattern: RegExp): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (pattern.test(name)) return join(dir, name);
  }
  return null;
}

export interface RunInstagramAcquisitionOptions {
  /** Override the workdir root (defaults to `process.env.FOOD_INGEST_DIR`). */
  ingestDir?: string;
  /** Override the cookies path (defaults to `process.env.INSTAGRAM_COOKIES_PATH`). */
  cookiesPath?: string;
  /** Injectable yt-dlp runner for tests. */
  runYtDlpFn?: typeof runYtDlp;
  /** Injectable caption reader for tests. */
  readCaptionFn?: typeof readCaption;
  /** Injectable workdir factory for tests. */
  mkdirFn?: (path: string) => Promise<void>;
  /** Injectable cleanup for cancellation tests. */
  rmFn?: (path: string) => Promise<void>;
  /** yt-dlp timeout override (ms). */
  timeoutMs?: number;
  /** How often the orchestrator polls `ctx.isCancelled()` while yt-dlp
   *  is running so an in-flight cancel can SIGTERM the child. */
  cancellationPollIntervalMs?: number;
}

const DEFAULT_CANCELLATION_POLL_MS = 1_000;
const NEVER_CANCELLED: HandlerContext = { isCancelled: () => false };

function resolveWorkDir(sourceId: number, opts: RunInstagramAcquisitionOptions): string {
  const root = opts.ingestDir ?? process.env['FOOD_INGEST_DIR'] ?? '/data/food/ingest';
  return join(root, String(sourceId));
}

function resolveCookiesPath(opts: RunInstagramAcquisitionOptions): string {
  return (
    opts.cookiesPath ?? process.env['INSTAGRAM_COOKIES_PATH'] ?? '/secrets/instagram-cookies.txt'
  );
}

function classifyYtDlpResult(
  ytDlpResult: YtDlpResult
):
  | { ok: true }
  | Exclude<AcquisitionResult, { ok: true } | { kind: 'cancelled' | 'missing-artifacts' }> {
  if (isAuthDead(ytDlpResult.stderr)) {
    return { ok: false, kind: 'auth-dead', stderr: ytDlpResult.stderr };
  }
  const rate = isRateLimited(ytDlpResult.stderr);
  if (rate.matched) {
    return { ok: false, kind: 'rate-limited', retryAfter: rate.retryAfter };
  }
  if (ytDlpResult.exitCode !== 0) {
    return {
      ok: false,
      kind: 'generic-failure',
      exitCode: ytDlpResult.exitCode,
      stderr: ytDlpResult.stderr,
    };
  }
  return { ok: true };
}

async function collectArtefacts(
  workDir: string,
  readCaptionImpl: typeof readCaption
): Promise<AcquisitionResult> {
  const videoPath = await firstMatch(workDir, VIDEO_EXT_RE);
  const infoJsonPath = await firstMatch(workDir, INFO_JSON_RE);
  const thumbnailPath = await firstMatch(workDir, THUMBNAIL_RE);
  if (videoPath == null || infoJsonPath == null) {
    return { ok: false, kind: 'missing-artifacts' };
  }
  const caption = await readCaptionImpl(infoJsonPath);
  return { ok: true, workDir, videoPath, infoJsonPath, thumbnailPath, caption };
}

function startCancellationPoll(
  ctx: HandlerContext,
  controller: AbortController,
  intervalMs: number
): { stop: () => void; isAborted: () => boolean } {
  let aborted = false;
  const handle = setInterval(() => {
    if (controller.signal.aborted) return;
    void Promise.resolve(ctx.isCancelled())
      .then((cancelled) => {
        if (cancelled && !controller.signal.aborted) {
          aborted = true;
          controller.abort();
        }
      })
      .catch(() => undefined);
  }, intervalMs);
  handle.unref?.();
  return {
    stop: () => clearInterval(handle),
    isAborted: () => aborted,
  };
}

/**
 * PRD-129 entry point. Spawns yt-dlp, classifies the outcome, and
 * returns a typed `AcquisitionResult`. The PRD-130 STT + vision
 * pipeline consumes this directly; the v1 worker handler wraps the
 * failure variants into `IngestJobResult` so the dispatch round-trip
 * stays green until 130 lands.
 *
 * Cancellation: `ctx.isCancelled()` is checked before spawn, polled
 * while yt-dlp is running (and forwards to a SIGTERM/SIGKILL via the
 * AbortSignal), and checked once more after the child exits. A
 * cancellation at any point returns `{ kind: 'cancelled' }` with a
 * `rm -rf` of the workdir.
 */
export async function runInstagramAcquisition(
  data: Extract<IngestJobData, { kind: 'url-instagram' }>,
  ctx: HandlerContext = NEVER_CANCELLED,
  opts: RunInstagramAcquisitionOptions = {}
): Promise<AcquisitionResult> {
  if (await ctx.isCancelled()) return { ok: false, kind: 'cancelled' };

  const workDir = resolveWorkDir(data.sourceId, opts);
  const cookiesPath = resolveCookiesPath(opts);
  const mkdirImpl =
    opts.mkdirFn ?? ((path: string) => mkdir(path, { recursive: true }).then(() => undefined));
  const rmImpl = opts.rmFn ?? ((path: string) => rm(path, { recursive: true, force: true }));

  await mkdirImpl(workDir);

  const ytDlp = opts.runYtDlpFn ?? runYtDlp;
  const controller = new AbortController();
  const poll = startCancellationPoll(
    ctx,
    controller,
    opts.cancellationPollIntervalMs ?? DEFAULT_CANCELLATION_POLL_MS
  );

  let ytDlpResult;
  try {
    ytDlpResult = await ytDlp({
      url: data.url,
      cookiesPath,
      output: workDir,
      timeoutMs: opts.timeoutMs,
      signal: controller.signal,
    });
  } finally {
    poll.stop();
  }

  if (poll.isAborted() || (await ctx.isCancelled())) {
    await rmImpl(workDir).catch(() => undefined);
    return { ok: false, kind: 'cancelled' };
  }

  const classification = classifyYtDlpResult(ytDlpResult);
  if (!classification.ok) return classification;

  return collectArtefacts(workDir, opts.readCaptionFn ?? readCaption);
}

export { isAuthDead, isRateLimited, runYtDlp } from './instagram-yt-dlp.js';
export type { RateLimitMatch, RunYtDlpOptions, YtDlpResult } from './instagram-yt-dlp.js';
