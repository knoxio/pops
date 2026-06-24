/**
 * Shared subprocess runner used by both the faster-whisper
 * (`stt-whisper.ts`) and ffmpeg (`ffmpeg-keyframes.ts`) wrappers.
 * Behaviour matches `runYtDlp` in `../instagram-yt-dlp.ts`:
 *
 *   - stdout/stderr are piped and **drained** to in-memory buffers so a
 *     chatty child (ffmpeg writes a lot to stderr) can't deadlock on a
 *     full pipe.
 *   - On timeout we send SIGTERM, then SIGKILL after `sigkillGraceMs` if
 *     the child is still alive. A SIGTERM-swallowing binary can't stall
 *     a BullMQ worker slot indefinitely.
 *   - The returned `exitCode=-1` whenever the child is killed by a
 *     signal (timeout or abort). Callers distinguish "real exit non-zero"
 *     from "forcefully terminated" via the boolean tuple element.
 */
import { spawn, type ChildProcess } from 'node:child_process';

export const DEFAULT_SIGKILL_GRACE_MS = 5_000;

export interface RunSubprocessOptions {
  bin: string;
  args: readonly string[];
  timeoutMs: number;
  /** Override the SIGTERM → SIGKILL escalation window. */
  sigkillGraceMs?: number;
  /** Test seam — defaults to `spawn` from `node:child_process`. */
  spawnImpl?: typeof spawn;
}

export interface SubprocessResult {
  exitCode: number;
  stderr: string;
  /** True when the child was killed by SIGTERM/SIGKILL after the timeout. */
  timedOut: boolean;
}

interface KillSwitch {
  forceKill: () => void;
  clear: () => void;
}

export function runSubprocess(opts: RunSubprocessOptions): Promise<SubprocessResult> {
  const spawnImpl = opts.spawnImpl ?? spawn;
  const sigkillGraceMs = opts.sigkillGraceMs ?? DEFAULT_SIGKILL_GRACE_MS;
  return new Promise<SubprocessResult>((resolve, reject) => {
    const child = spawnImpl(opts.bin, [...opts.args], { stdio: ['ignore', 'pipe', 'pipe'] });
    const stderrChunks: Buffer[] = [];
    drain(child, stderrChunks);

    const kill = makeKillSwitch(child, sigkillGraceMs);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      kill.forceKill();
    }, opts.timeoutMs);
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      kill.clear();
      fn();
    };
    child.on('error', (err) => finish((): void => reject(err)));
    child.on('close', (code, signal) => {
      const exitCode = signal !== null || timedOut ? -1 : (code ?? -1);
      finish((): void =>
        resolve({
          exitCode,
          stderr: Buffer.concat(stderrChunks).toString('utf-8'),
          timedOut,
        })
      );
    });
  });
}

function drain(child: ChildProcess, stderrChunks: Buffer[]): void {
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });
  child.stdout?.on('data', () => {
    // The chatty processes (ffmpeg, whisper) write progress info to
    // stderr. stdout is rarely used, but read-and-discard so the pipe
    // doesn't back up either.
  });
}

function makeKillSwitch(child: ChildProcess, graceMs: number): KillSwitch {
  let sigkillTimer: NodeJS.Timeout | null = null;
  return {
    forceKill: () => {
      if (sigkillTimer !== null) return;
      child.kill('SIGTERM');
      sigkillTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, graceMs);
    },
    clear: () => {
      if (sigkillTimer !== null) {
        clearTimeout(sigkillTimer);
        sigkillTimer = null;
      }
    },
  };
}
