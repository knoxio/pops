/**
 * PRD-130 — `faster-whisper` subprocess wrapper.
 *
 * Spawns `python3 -m faster_whisper.cli` with the flags called out in the
 * PRD, parses the resulting `transcript.vtt`, and returns the concatenated
 * cues as a flat transcript string. Failures (non-zero exit, timeout,
 * missing output) raise — the orchestrator's try/catch routes them to the
 * `transcriptOk=false` degradation branch.
 *
 * Mid-spawn cancellation: the same `AbortController` pattern PRD-129's
 * yt-dlp wrapper uses. The orchestrator polls `ctx.isCancelled()` between
 * stages; we don't need a poll inside the subprocess.
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MODEL = 'distil-large-v3';
const DEFAULT_BIN = 'python3';
const DEFAULT_OUTPUT_NAME = 'transcript.vtt';

export interface RunWhisperOptions {
  videoPath: string;
  workDir: string;
  /** Override model (default `distil-large-v3`). */
  model?: string;
  /** Override executable (default `python3`). */
  pythonBin?: string;
  /** Override timeout (default 120s). */
  timeoutMs?: number;
  /** Test seam: substitute the spawn implementation. */
  spawnImpl?: typeof spawn;
  /** Test seam: substitute the file reader for the produced VTT. */
  readFileImpl?: (path: string) => Promise<string>;
}

export interface WhisperResult {
  transcript: string;
  model: string;
  durationMs: number;
  vttPath: string;
}

export async function runWhisper(opts: RunWhisperOptions): Promise<WhisperResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const pythonBin = opts.pythonBin ?? DEFAULT_BIN;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnImpl = opts.spawnImpl ?? spawn;
  const readImpl = opts.readFileImpl ?? ((p) => readFile(p, 'utf-8'));

  const args = [
    '-m',
    'faster_whisper.cli',
    '--model',
    model,
    '--device',
    'cpu',
    '--compute_type',
    'int8',
    '--output_format',
    'vtt',
    '--output_dir',
    opts.workDir,
    '--beam_size',
    '5',
    '--language',
    'auto',
    opts.videoPath,
  ];

  const start = Date.now();
  const exitCode = await spawnAndWait(spawnImpl, pythonBin, args, timeoutMs);
  if (exitCode !== 0) {
    throw new WhisperError(`faster-whisper exited with code ${exitCode}`);
  }
  const vttPath = join(opts.workDir, DEFAULT_OUTPUT_NAME);
  const raw = await readImpl(vttPath);
  return {
    transcript: parseVtt(raw),
    model,
    durationMs: Date.now() - start,
    vttPath,
  };
}

function spawnAndWait(
  spawnImpl: typeof spawn,
  bin: string,
  args: readonly string[],
  timeoutMs: number
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawnImpl(bin, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let timer: NodeJS.Timeout | undefined;
    let settled = false;
    const finalise = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn();
    };
    timer = setTimeout(() => {
      child.kill('SIGTERM');
      finalise((): void => reject(new WhisperError(`faster-whisper exceeded ${timeoutMs}ms`)));
    }, timeoutMs);
    child.on('error', (err) => finalise((): void => reject(err)));
    child.on('close', (code) => {
      finalise((): void => resolve(code ?? -1));
    });
  });
}

export class WhisperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhisperError';
  }
}

/**
 * Concatenate the spoken cues from a WebVTT file. Strips timestamps,
 * blank lines, and the `WEBVTT` header. Cues may be multi-line; we join
 * them with a single space and the cues themselves with a newline.
 */
export function parseVtt(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const cues: string[] = [];
  let buffer: string[] = [];
  const flush = (): void => {
    if (buffer.length === 0) return;
    cues.push(buffer.join(' ').trim());
    buffer = [];
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line === 'WEBVTT') {
      flush();
      continue;
    }
    if (/-->/.test(line)) {
      flush();
      continue;
    }
    if (/^\d+$/.test(line)) {
      // Numeric cue identifier — skip.
      continue;
    }
    buffer.push(line);
  }
  flush();
  return cues.filter((c) => c.length > 0).join('\n');
}
