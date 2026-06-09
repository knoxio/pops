/**
 * PRD-130 — ffmpeg keyframe extraction.
 *
 * Scene-detection pass (`select='gt(scene,0.3)'`) writes ≤10 720p JPEGs
 * to `${workDir}/keyframes/%03d.jpg`. If scene detection returns no
 * frames (very short reel, no scene changes), a single fallback frame is
 * extracted at the 2-second mark. Failures (non-zero exit, timeout,
 * keyframes dir missing afterwards) raise — the orchestrator's try/catch
 * routes them to `keyframesOk=false`.
 */
import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_BIN = 'ffmpeg';
const SCENE_THRESHOLD = 0.3;
const MAX_FRAMES = 10;
const FALLBACK_FRAME_SECONDS = 2;

export interface ExtractKeyframesOptions {
  videoPath: string;
  workDir: string;
  ffmpegBin?: string;
  timeoutMs?: number;
  spawnImpl?: typeof spawn;
  mkdirImpl?: (path: string) => Promise<unknown>;
  readdirImpl?: (path: string) => Promise<string[]>;
}

export interface KeyframesResult {
  paths: string[];
  durationMs: number;
  usedFallback: boolean;
}

export async function extractKeyframes(opts: ExtractKeyframesOptions): Promise<KeyframesResult> {
  const ffmpegBin = opts.ffmpegBin ?? DEFAULT_BIN;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnImpl = opts.spawnImpl ?? spawn;
  const mkdirImpl = opts.mkdirImpl ?? ((p) => mkdir(p, { recursive: true }));
  const readdirImpl = opts.readdirImpl ?? ((p) => readdir(p));

  const keyframesDir = join(opts.workDir, 'keyframes');
  await mkdirImpl(keyframesDir);

  const start = Date.now();
  const sceneArgs = sceneDetectionArgs(opts.videoPath, keyframesDir);
  const sceneExit = await spawnAndWait(spawnImpl, ffmpegBin, sceneArgs, timeoutMs);
  if (sceneExit !== 0) {
    throw new FfmpegError(`ffmpeg scene-detection exited with code ${sceneExit}`);
  }
  let paths = await listKeyframes(keyframesDir, readdirImpl);

  let usedFallback = false;
  if (paths.length === 0) {
    const fallbackArgs = fallbackArgsAt(opts.videoPath, keyframesDir);
    const fallbackExit = await spawnAndWait(spawnImpl, ffmpegBin, fallbackArgs, timeoutMs);
    if (fallbackExit !== 0) {
      throw new FfmpegError(`ffmpeg fallback frame exited with code ${fallbackExit}`);
    }
    usedFallback = true;
    paths = await listKeyframes(keyframesDir, readdirImpl);
  }

  return { paths, durationMs: Date.now() - start, usedFallback };
}

function sceneDetectionArgs(videoPath: string, outDir: string): string[] {
  return [
    '-i',
    videoPath,
    '-vf',
    `select='gt(scene,${SCENE_THRESHOLD})',scale=720:-2`,
    '-vsync',
    'vfr',
    '-q:v',
    '2',
    '-frames:v',
    String(MAX_FRAMES),
    join(outDir, '%03d.jpg'),
  ];
}

function fallbackArgsAt(videoPath: string, outDir: string): string[] {
  return [
    '-ss',
    String(FALLBACK_FRAME_SECONDS),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    join(outDir, '000.jpg'),
  ];
}

async function listKeyframes(
  dir: string,
  readdirImpl: (path: string) => Promise<string[]>
): Promise<string[]> {
  const names = await readdirImpl(dir);
  return names
    .filter((n) => n.endsWith('.jpg'))
    .toSorted()
    .map((n) => join(dir, n));
}

function spawnAndWait(
  spawnImpl: typeof spawn,
  bin: string,
  args: readonly string[],
  timeoutMs: number
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawnImpl(bin, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(() => reject(new FfmpegError(`ffmpeg exceeded ${timeoutMs}ms`)));
    }, timeoutMs);
    function finish(fn: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    }
    child.on('error', (err) => finish(() => reject(err)));
    child.on('close', (code) => finish(() => resolve(code ?? -1)));
  });
}

export class FfmpegError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FfmpegError';
  }
}
