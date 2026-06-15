/**
 * PRD-130 — per-stage runners (STT, keyframes) split out of the
 * orchestrator to keep each file under the per-file lint cap. Pure
 * functions: they only know how to run one subprocess, populate the
 * per-stage meta record, and report `ok`/`skipped`.
 */
import { extractKeyframes } from './ffmpeg-keyframes.js';
import { runWhisper } from './stt-whisper.js';

import type { IngestMeta } from '../../../contract/queue/index.js';
import type { AcquisitionResult } from '../instagram-acquisition.js';

export interface SttOutcome {
  transcript: string | null;
  ok: boolean;
}

export interface KeyframesOutcome {
  keyframes: string[];
  ok: boolean;
}

export interface SttDeps {
  whisperModel?: string;
  runWhisperImpl?: typeof runWhisper;
}

export interface KeyframesDeps {
  extractKeyframesImpl?: typeof extractKeyframes;
}

export async function runSttStage(args: {
  acq: Extract<AcquisitionResult, { ok: true }>;
  captionStructured: boolean;
  deps: SttDeps;
  meta: IngestMeta;
}): Promise<SttOutcome> {
  if (args.captionStructured) {
    args.meta.stages['stt'] = { ok: true, skipped: true, reason: 'caption structured' };
    return { transcript: null, ok: true };
  }
  try {
    const result = await (args.deps.runWhisperImpl ?? runWhisper)({
      videoPath: args.acq.videoPath,
      workDir: args.acq.workDir,
      model: args.deps.whisperModel,
    });
    args.meta.stages['stt'] = {
      ok: true,
      duration_ms: result.durationMs,
      model: result.model,
      transcript_chars: result.transcript.length,
    };
    return { transcript: result.transcript, ok: true };
  } catch (err) {
    args.meta.stages['stt'] = {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
    return { transcript: null, ok: false };
  }
}

export async function runKeyframesStage(args: {
  acq: Extract<AcquisitionResult, { ok: true }>;
  deps: KeyframesDeps;
  meta: IngestMeta;
}): Promise<KeyframesOutcome> {
  try {
    const result = await (args.deps.extractKeyframesImpl ?? extractKeyframes)({
      videoPath: args.acq.videoPath,
      workDir: args.acq.workDir,
    });
    args.meta.stages['keyframes'] = {
      ok: true,
      duration_ms: result.durationMs,
      count: result.paths.length,
      used_fallback: result.usedFallback,
    };
    return { keyframes: result.paths, ok: true };
  } catch (err) {
    args.meta.stages['keyframes'] = {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
    return { keyframes: [], ok: false };
  }
}
