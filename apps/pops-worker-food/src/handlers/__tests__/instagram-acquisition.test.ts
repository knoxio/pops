import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isAuthDead,
  isRateLimited,
  readCaption,
  runInstagramAcquisition,
  runYtDlp,
} from '../instagram-acquisition.js';

import type { ChildProcess } from 'node:child_process';

import type { RunInstagramAcquisitionOptions, YtDlpResult } from '../instagram-acquisition.js';
import type { HandlerContext } from '../types.js';

const NEVER_CANCELLED: HandlerContext = { isCancelled: () => false };
const ALWAYS_CANCELLED: HandlerContext = { isCancelled: () => true };

const IG_JOB = {
  kind: 'url-instagram',
  sourceId: 42,
  url: 'https://www.instagram.com/reel/abc123/',
} as const;

const VIDEO_RESULT: YtDlpResult = { exitCode: 0, stdout: '', stderr: '', timedOut: false };

interface MakeAcquisitionOpts {
  workDir: string;
  artefacts?: Array<{ name: string; content?: string }>;
  ytDlpResult?: YtDlpResult;
  readCaptionResult?: string | null;
  ctx?: HandlerContext;
  rmFn?: RunInstagramAcquisitionOptions['rmFn'];
}

function makeOpts(opts: MakeAcquisitionOpts): RunInstagramAcquisitionOptions {
  return {
    ingestDir: opts.workDir,
    cookiesPath: '/tmp/cookies.txt',
    mkdirFn: async () => undefined,
    rmFn: opts.rmFn ?? (async () => undefined),
    readCaptionFn: async () => opts.readCaptionResult ?? null,
    runYtDlpFn: async () => {
      if (opts.artefacts != null) {
        for (const { name, content = '' } of opts.artefacts) {
          await writeFile(join(opts.workDir, String(IG_JOB.sourceId), name), content);
        }
      }
      return opts.ytDlpResult ?? VIDEO_RESULT;
    },
  };
}

let scratch = '';
beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'pops-ig-test-'));
  await import('node:fs/promises').then(({ mkdir }) =>
    mkdir(join(scratch, String(IG_JOB.sourceId)), { recursive: true })
  );
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('isAuthDead', () => {
  it.each([
    ['login required to view this post', true],
    ['Please log in or sign up to continue', true],
    ['Restricted Video: please log in', true],
    ['Login cookies appear to be invalid', true],
    ['authentication is required to access this resource', true],
    ['This account is private and you are not following it', true],
    ['network is unreachable', false],
    ['HTTP Error 429: Too Many Requests', false],
    ['', false],
  ])('matches %p → %p', (stderr, expected) => {
    expect(isAuthDead(stderr)).toBe(expected);
  });
});

describe('isRateLimited', () => {
  it('returns matched=false on unrelated stderr', () => {
    expect(isRateLimited('network blip')).toEqual({ matched: false, retryAfter: 0 });
  });

  it('matches HTTP 429 with default fallback delay', () => {
    expect(isRateLimited('ERROR: HTTP Error 429')).toEqual({ matched: true, retryAfter: 300 });
  });

  it('matches "Too Many Requests" with default fallback delay', () => {
    expect(isRateLimited('Too Many Requests from this IP')).toEqual({
      matched: true,
      retryAfter: 300,
    });
  });

  it('parses Retry-After in seconds when present', () => {
    expect(isRateLimited('HTTP Error 429\nRetry-After: 90\n')).toEqual({
      matched: true,
      retryAfter: 90,
    });
  });

  it('falls back to 300 on a non-numeric Retry-After', () => {
    expect(isRateLimited('Too Many Requests\nRetry-After: tomorrow')).toEqual({
      matched: true,
      retryAfter: 300,
    });
  });

  it('falls back to 300 on a zero Retry-After', () => {
    expect(isRateLimited('Too Many Requests\nRetry-After: 0\n')).toEqual({
      matched: true,
      retryAfter: 300,
    });
  });
});

describe('readCaption', () => {
  it('returns the description field when present', async () => {
    const path = join(scratch, 'info.json');
    await writeFile(path, JSON.stringify({ description: 'Smash burger 🍔' }));
    await expect(readCaption(path)).resolves.toBe('Smash burger 🍔');
  });

  it('returns null when the description is empty', async () => {
    const path = join(scratch, 'info.json');
    await writeFile(path, JSON.stringify({ description: '   ' }));
    await expect(readCaption(path)).resolves.toBeNull();
  });

  it('returns null when the description field is missing', async () => {
    const path = join(scratch, 'info.json');
    await writeFile(path, JSON.stringify({ other: 'field' }));
    await expect(readCaption(path)).resolves.toBeNull();
  });

  it('returns null on invalid JSON', async () => {
    const path = join(scratch, 'info.json');
    await writeFile(path, 'not json');
    await expect(readCaption(path)).resolves.toBeNull();
  });

  it('returns null when the file does not exist', async () => {
    await expect(readCaption(join(scratch, 'missing.json'))).resolves.toBeNull();
  });
});

describe('runInstagramAcquisition', () => {
  it('returns ok=true with full artefact paths on a successful download', async () => {
    const workDir = join(scratch, String(IG_JOB.sourceId));
    const opts = makeOpts({
      workDir: scratch,
      artefacts: [
        { name: 'abc123.mp4', content: 'video' },
        {
          name: 'abc123.info.json',
          content: JSON.stringify({ description: 'caption text' }),
        },
        { name: 'abc123.jpg', content: 'jpg' },
      ],
      readCaptionResult: 'caption text',
    });

    const result = await runInstagramAcquisition(IG_JOB, NEVER_CANCELLED, opts);

    expect(result).toEqual({
      ok: true,
      workDir,
      videoPath: join(workDir, 'abc123.mp4'),
      infoJsonPath: join(workDir, 'abc123.info.json'),
      thumbnailPath: join(workDir, 'abc123.jpg'),
      caption: 'caption text',
    });
  });

  it('returns ok=true with thumbnailPath=null when thumbnail missing', async () => {
    const workDir = join(scratch, String(IG_JOB.sourceId));
    const opts = makeOpts({
      workDir: scratch,
      artefacts: [
        { name: 'abc.mp4' },
        { name: 'abc.info.json', content: JSON.stringify({ description: 'cap' }) },
      ],
      readCaptionResult: 'cap',
    });

    const result = await runInstagramAcquisition(IG_JOB, NEVER_CANCELLED, opts);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.thumbnailPath).toBeNull();
    expect(result.videoPath).toBe(join(workDir, 'abc.mp4'));
  });

  it('classifies auth-dead errors before other heuristics', async () => {
    const opts = makeOpts({
      workDir: scratch,
      ytDlpResult: {
        exitCode: 1,
        stdout: '',
        stderr: 'ERROR: Login cookies are invalid',
        timedOut: false,
      },
    });

    const result = await runInstagramAcquisition(IG_JOB, NEVER_CANCELLED, opts);

    expect(result).toEqual({
      ok: false,
      kind: 'auth-dead',
      stderr: 'ERROR: Login cookies are invalid',
    });
  });

  it('classifies rate-limited errors with the parsed Retry-After', async () => {
    const opts = makeOpts({
      workDir: scratch,
      ytDlpResult: {
        exitCode: 1,
        stdout: '',
        stderr: 'ERROR: HTTP Error 429\nRetry-After: 120\n',
        timedOut: false,
      },
    });

    const result = await runInstagramAcquisition(IG_JOB, NEVER_CANCELLED, opts);

    expect(result).toEqual({ ok: false, kind: 'rate-limited', retryAfter: 120 });
  });

  it('returns generic-failure for non-zero exits that do not match known patterns', async () => {
    const opts = makeOpts({
      workDir: scratch,
      ytDlpResult: {
        exitCode: 2,
        stdout: '',
        stderr: 'unknown error from yt-dlp',
        timedOut: false,
      },
    });

    const result = await runInstagramAcquisition(IG_JOB, NEVER_CANCELLED, opts);

    expect(result).toEqual({
      ok: false,
      kind: 'generic-failure',
      exitCode: 2,
      stderr: 'unknown error from yt-dlp',
    });
  });

  it('returns missing-artifacts when yt-dlp exits 0 but no .mp4 was written', async () => {
    const opts = makeOpts({
      workDir: scratch,
      artefacts: [{ name: 'abc.info.json', content: '{}' }],
    });

    const result = await runInstagramAcquisition(IG_JOB, NEVER_CANCELLED, opts);

    expect(result).toEqual({ ok: false, kind: 'missing-artifacts' });
  });

  it('returns missing-artifacts when info.json is absent', async () => {
    const opts = makeOpts({
      workDir: scratch,
      artefacts: [{ name: 'abc.mp4' }],
    });

    const result = await runInstagramAcquisition(IG_JOB, NEVER_CANCELLED, opts);

    expect(result).toEqual({ ok: false, kind: 'missing-artifacts' });
  });

  it('honours cancellation before invoking yt-dlp', async () => {
    const ytDlp = vi.fn(async () => VIDEO_RESULT);
    const result = await runInstagramAcquisition(IG_JOB, ALWAYS_CANCELLED, {
      ingestDir: scratch,
      cookiesPath: '/tmp/cookies.txt',
      mkdirFn: async () => undefined,
      runYtDlpFn: ytDlp,
    });

    expect(result).toEqual({ ok: false, kind: 'cancelled' });
    expect(ytDlp).not.toHaveBeenCalled();
  });

  it('honours cancellation after yt-dlp returns and cleans up the workdir', async () => {
    const rmFn = vi.fn(async () => undefined);
    let firstCall = true;
    const ctx: HandlerContext = {
      isCancelled: () => {
        if (firstCall) {
          firstCall = false;
          return false;
        }
        return true;
      },
    };

    const result = await runInstagramAcquisition(IG_JOB, ctx, {
      ingestDir: scratch,
      cookiesPath: '/tmp/cookies.txt',
      mkdirFn: async () => undefined,
      rmFn,
      runYtDlpFn: async () => VIDEO_RESULT,
    });

    expect(result).toEqual({ ok: false, kind: 'cancelled' });
    expect(rmFn).toHaveBeenCalledWith(join(scratch, String(IG_JOB.sourceId)));
  });

  it('mid-spawn cancellation aborts yt-dlp via the signal and cleans the workdir', async () => {
    const rmFn = vi.fn(async () => undefined);
    let ytDlpAborted = false;
    let cancelled = false;
    const ctx: HandlerContext = { isCancelled: () => cancelled };

    const result = await runInstagramAcquisition(IG_JOB, ctx, {
      ingestDir: scratch,
      cookiesPath: '/tmp/cookies.txt',
      mkdirFn: async () => undefined,
      rmFn,
      cancellationPollIntervalMs: 10,
      runYtDlpFn: async (args) =>
        new Promise((resolve) => {
          setTimeout(() => {
            cancelled = true;
          }, 20);
          args.signal?.addEventListener('abort', () => {
            ytDlpAborted = true;
            resolve({ exitCode: -1, stdout: '', stderr: '', timedOut: false });
          });
        }),
    });

    expect(ytDlpAborted).toBe(true);
    expect(result).toEqual({ ok: false, kind: 'cancelled' });
    expect(rmFn).toHaveBeenCalledWith(join(scratch, String(IG_JOB.sourceId)));
  });

  it('defaults ctx to a never-cancelled context so single-arg use matches the PRD doc', async () => {
    const workDir = join(scratch, String(IG_JOB.sourceId));
    const ranYtDlp = vi.fn(async () => VIDEO_RESULT);

    // Single positional `data` argument — matches the PRD's
    // `runInstagramAcquisition(data)` example. We pass opts to inject
    // the test seams but deliberately omit `ctx`.
    const result = await runInstagramAcquisition(IG_JOB, undefined, {
      ingestDir: scratch,
      cookiesPath: '/tmp/cookies.txt',
      mkdirFn: async () => undefined,
      runYtDlpFn: ranYtDlp,
    });

    expect(ranYtDlp).toHaveBeenCalledTimes(1);
    // No artefacts written → missing-artifacts, not cancelled.
    expect(result).toEqual({ ok: false, kind: 'missing-artifacts' });
    expect(workDir.endsWith(String(IG_JOB.sourceId))).toBe(true);
  });

  it('reads INSTAGRAM_COOKIES_PATH and FOOD_INGEST_DIR from env when not overridden', async () => {
    const captured: { url?: string; cookiesPath?: string; output?: string } = {};
    const prevDir = process.env['FOOD_INGEST_DIR'];
    const prevCookies = process.env['INSTAGRAM_COOKIES_PATH'];
    process.env['FOOD_INGEST_DIR'] = scratch;
    process.env['INSTAGRAM_COOKIES_PATH'] = '/secrets/from-env.txt';
    try {
      const result = await runInstagramAcquisition(IG_JOB, NEVER_CANCELLED, {
        mkdirFn: async () => undefined,
        readCaptionFn: async () => null,
        runYtDlpFn: async (args) => {
          captured.url = args.url;
          captured.cookiesPath = args.cookiesPath;
          captured.output = args.output;
          return VIDEO_RESULT;
        },
      });

      expect(captured.cookiesPath).toBe('/secrets/from-env.txt');
      expect(captured.url).toBe(IG_JOB.url);
      expect(captured.output).toBe(join(scratch, String(IG_JOB.sourceId)));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.kind).toBe('missing-artifacts');
    } finally {
      if (prevDir == null) delete process.env['FOOD_INGEST_DIR'];
      else process.env['FOOD_INGEST_DIR'] = prevDir;
      if (prevCookies == null) delete process.env['INSTAGRAM_COOKIES_PATH'];
      else process.env['INSTAGRAM_COOKIES_PATH'] = prevCookies;
    }
  });
});

function makeFakeChild(opts: {
  exit?: { code: number | null; signal: NodeJS.Signals | null } | { error: Error };
  stdout?: string;
  stderr?: string;
  killAfterMs?: number;
}): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  const stdout = new EventEmitter() as ChildProcess['stdout'];
  const stderr = new EventEmitter() as ChildProcess['stderr'];
  Object.defineProperty(child, 'stdout', { value: stdout });
  Object.defineProperty(child, 'stderr', { value: stderr });

  child.kill = vi.fn((sig?: NodeJS.Signals | number): boolean => {
    setImmediate(() => child.emit('close', null, sig ?? 'SIGTERM'));
    return true;
  });

  setImmediate(() => {
    if (opts.stdout != null && opts.stdout !== '') stdout?.emit('data', Buffer.from(opts.stdout));
    if (opts.stderr != null && opts.stderr !== '') stderr?.emit('data', Buffer.from(opts.stderr));
    const exit = opts.exit;
    if (exit != null && 'error' in exit) {
      child.emit('error', exit.error);
      return;
    }
    if (exit != null) {
      setImmediate(() => child.emit('close', exit.code, exit.signal));
    }
  });

  return child;
}

describe('runYtDlp', () => {
  it('resolves with stdout/stderr/exitCode on a normal exit', async () => {
    const spawnFn = vi.fn(() =>
      makeFakeChild({
        exit: { code: 0, signal: null },
        stdout: 'video downloaded\n',
        stderr: 'warning: foo\n',
      })
    );

    const result = await runYtDlp({
      url: 'https://instagram.com/reel/x/',
      cookiesPath: '/tmp/cookies.txt',
      output: '/tmp/wd',
      spawnFn: spawnFn as never,
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'video downloaded\n',
      stderr: 'warning: foo\n',
      timedOut: false,
    });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnFn.mock.calls[0] ?? [];
    expect(cmd).toBe('yt-dlp');
    expect(args).toContain('--cookies');
    expect(args).toContain('/tmp/cookies.txt');
    expect(args).toContain('--no-playlist');
    expect(args).toContain('--write-info-json');
    expect(args).toContain('--write-thumbnail');
    expect(args).toContain('https://instagram.com/reel/x/');
  });

  it('captures stderr from an auth-dead-shaped failure', async () => {
    const spawnFn = vi.fn(() =>
      makeFakeChild({
        exit: { code: 1, signal: null },
        stderr: 'ERROR: Login cookies are invalid\n',
      })
    );

    const result = await runYtDlp({
      url: 'https://instagram.com/reel/x/',
      cookiesPath: '/tmp/cookies.txt',
      output: '/tmp/wd',
      spawnFn: spawnFn as never,
    });

    expect(result.exitCode).toBe(1);
    expect(isAuthDead(result.stderr)).toBe(true);
  });

  it('rejects when the child emits an error event', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ exit: { error: new Error('ENOENT yt-dlp') } }));

    await expect(
      runYtDlp({
        url: 'https://instagram.com/reel/x/',
        cookiesPath: '/tmp/cookies.txt',
        output: '/tmp/wd',
        spawnFn: spawnFn as never,
      })
    ).rejects.toThrow(/ENOENT yt-dlp/);
  });

  it('kills the child on abort signal', async () => {
    const controller = new AbortController();
    const child = makeFakeChild({}); // never exits on its own
    const spawnFn = vi.fn(() => child);

    const promise = runYtDlp({
      url: 'https://instagram.com/reel/x/',
      cookiesPath: '/tmp/cookies.txt',
      output: '/tmp/wd',
      spawnFn: spawnFn as never,
      signal: controller.signal,
    });

    setImmediate(() => controller.abort());
    const result = await promise;

    expect(child.kill).toHaveBeenCalled();
    expect(result.exitCode).toBe(-1);
  });

  it('marks timedOut=true and kills the child when the timeout fires', async () => {
    vi.useFakeTimers();
    const child = makeFakeChild({}); // never exits on its own
    const spawnFn = vi.fn(() => child);

    const promise = runYtDlp({
      url: 'https://instagram.com/reel/x/',
      cookiesPath: '/tmp/cookies.txt',
      output: '/tmp/wd',
      spawnFn: spawnFn as never,
      timeoutMs: 100,
    });

    await vi.advanceTimersByTimeAsync(150);
    vi.useRealTimers();
    const result = await promise;

    expect(result.timedOut).toBe(true);
    expect(child.kill).toHaveBeenCalled();
  });

  it('escalates SIGTERM to SIGKILL after the grace period if the child does not exit', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as ChildProcess;
    Object.defineProperty(child, 'stdout', { value: new EventEmitter() });
    Object.defineProperty(child, 'stderr', { value: new EventEmitter() });
    // The fake child swallows SIGTERM (does NOT emit close) so we can
    // observe the escalation. SIGKILL closes the process.
    child.kill = vi.fn((sig?: NodeJS.Signals | number): boolean => {
      if (sig === 'SIGKILL') {
        setImmediate(() => child.emit('close', null, 'SIGKILL'));
      }
      return true;
    });
    const spawnFn = vi.fn(() => child);

    const promise = runYtDlp({
      url: 'https://instagram.com/reel/x/',
      cookiesPath: '/tmp/cookies.txt',
      output: '/tmp/wd',
      spawnFn: spawnFn as never,
      timeoutMs: 100,
      sigkillGraceMs: 50,
    });

    await vi.advanceTimersByTimeAsync(120);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(child.kill).not.toHaveBeenCalledWith('SIGKILL');

    await vi.advanceTimersByTimeAsync(60);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');

    vi.useRealTimers();
    const result = await promise;
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(-1);
  });
});
