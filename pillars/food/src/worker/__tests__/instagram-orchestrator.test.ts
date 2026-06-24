import { describe, expect, it, vi } from 'vitest';

import {
  PIPELINE_VERSION,
  runInstagramPipeline,
  type InstagramIngestDeps,
} from '../handlers/instagram/orchestrator.js';

import type { AcquisitionResult } from '../handlers/instagram-acquisition.js';
import type { AnthropicLike } from '../handlers/instagram/anthropic-client.js';
import type { ExtractedRecipe } from '../handlers/instagram/extracted-recipe.js';
import type { HandlerContext } from '../handlers/types.js';

const STRUCTURED_CAPTION = [
  'Weeknight pancakes',
  '- 2 cups flour',
  '- 1 tbsp baking powder',
  '- 1 tsp salt',
  '- 1 cup milk',
  '- 2 tbsp butter',
  'Whisk dry. Whisk wet. Cook on a hot pan.',
].join('\n');

const NON_STRUCTURED_CAPTION =
  'A reel about smash burgers and how juicy they get on a hot pan. Try it at home!';

const HAPPY_PARSED: ExtractedRecipe = {
  title: 'Smash Burger',
  summary: null,
  servings: 4,
  prep_time_min: 5,
  cook_time_min: 10,
  ingredients: [
    {
      ingredient_slug: 'beef',
      variant_slug: null,
      prep_state_slug: null,
      qty: 500,
      unit: 'g',
      notes: null,
    },
  ],
  steps: [{ body: 'Smash and sear.', duration_min: null, temperature_c: null }],
};

function noopClient(): AnthropicLike {
  return { messages: { create: vi.fn() } };
}

function ctx(isCancelled = false): HandlerContext {
  return { isCancelled: () => isCancelled };
}

function acqOk(caption: string | null): Extract<AcquisitionResult, { ok: true }> {
  return {
    ok: true,
    workDir: '/tmp/ig/1',
    videoPath: '/tmp/ig/1/video.mp4',
    infoJsonPath: '/tmp/ig/1/info.json',
    thumbnailPath: null,
    caption,
  };
}

function whisperOk(transcript: string) {
  return vi.fn(async () => ({
    transcript,
    model: 'distil-large-v3',
    durationMs: 1234,
    vttPath: '/tmp/ig/1/transcript.vtt',
  }));
}

function ffmpegOk(paths: string[]) {
  return vi.fn(async () => ({ paths, durationMs: 100, usedFallback: false }));
}

function visionOk(parsed: ExtractedRecipe) {
  return vi.fn(async () => ({
    parsed,
    model: 'claude-haiku-4-5-20251001',
    promptVersion: 'ig-vision-v1.0',
    inputTokens: 1000,
    outputTokens: 500,
    keyframesSent: 5,
    durationMs: 500,
  }));
}

function textFallbackOk(parsed: ExtractedRecipe) {
  return vi.fn(async () => ({
    parsed,
    model: 'claude-haiku-4-5-20251001',
    promptVersion: 'web-llm-v1.0',
    operation: 'recipe-extract-ig-text-fallback',
    inputTokens: 800,
    outputTokens: 400,
    durationMs: 400,
  }));
}

function deps(overrides: Partial<InstagramIngestDeps> = {}): InstagramIngestDeps {
  return {
    anthropicClient: noopClient(),
    runAcquisitionImpl: vi.fn(async () => acqOk(STRUCTURED_CAPTION)),
    runWhisperImpl: whisperOk('transcript text'),
    extractKeyframesImpl: ffmpegOk(['/tmp/k1.jpg', '/tmp/k2.jpg']),
    extractWithVisionImpl: visionOk(HAPPY_PARSED),
    extractWithTextFallbackImpl: textFallbackOk(HAPPY_PARSED),
    ...overrides,
  };
}

const DATA = { kind: 'url-instagram' as const, sourceId: 1, url: 'https://instagram.com/reel/abc' };

describe('runInstagramPipeline — happy path', () => {
  it('skips STT when the caption is structured', async () => {
    const whisper = whisperOk('');
    const result = await runInstagramPipeline(DATA, ctx(), deps({ runWhisperImpl: whisper }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(whisper).not.toHaveBeenCalled();
    expect(result.partialReason).toBeUndefined();
    expect(result.meta.extractor_version).toBe(PIPELINE_VERSION);
    const sttStage = result.meta.stages['stt'] as { skipped?: boolean } | undefined;
    expect(sttStage?.skipped).toBe(true);
  });

  it('runs STT when the caption is unstructured', async () => {
    const whisper = whisperOk('words');
    const result = await runInstagramPipeline(
      DATA,
      ctx(),
      deps({
        runAcquisitionImpl: vi.fn(async () => acqOk(NON_STRUCTURED_CAPTION)),
        runWhisperImpl: whisper,
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(whisper).toHaveBeenCalledOnce();
    expect(result.partialReason).toBeUndefined();
  });
});

describe('runInstagramPipeline — degradation truth table', () => {
  it('STT fails but vision succeeds → partialReason=stt-failed', async () => {
    const result = await runInstagramPipeline(
      DATA,
      ctx(),
      deps({
        runAcquisitionImpl: vi.fn(async () => acqOk(NON_STRUCTURED_CAPTION)),
        runWhisperImpl: vi.fn(async () => {
          throw new Error('whisper crashed');
        }),
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.partialReason).toBe('stt-failed');
  });

  it('vision fails + keyframes available + text-fallback succeeds → partialReason=vision-failed', async () => {
    const result = await runInstagramPipeline(
      DATA,
      ctx(),
      deps({
        runAcquisitionImpl: vi.fn(async () => acqOk(NON_STRUCTURED_CAPTION)),
        extractWithVisionImpl: vi.fn(async () => {
          throw new Error('vision down');
        }),
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.partialReason).toBe('vision-failed');
  });

  it('vision fails + keyframes missing + text-fallback succeeds → partialReason=caption-only-fallback', async () => {
    const result = await runInstagramPipeline(
      DATA,
      ctx(),
      deps({
        runAcquisitionImpl: vi.fn(async () => acqOk(NON_STRUCTURED_CAPTION)),
        extractKeyframesImpl: vi.fn(async () => {
          throw new Error('ffmpeg missing');
        }),
        extractWithVisionImpl: vi.fn(async () => {
          throw new Error('vision down');
        }),
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.partialReason).toBe('caption-only-fallback');
  });

  it('vision fails + caption too short → AllExtractionPathsFailed', async () => {
    const result = await runInstagramPipeline(
      DATA,
      ctx(),
      deps({
        runAcquisitionImpl: vi.fn(async () => acqOk('tiny')),
        extractWithVisionImpl: vi.fn(async () => {
          throw new Error('vision down');
        }),
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('AllExtractionPathsFailed');
  });

  it('vision fails + text fallback also fails → AllExtractionPathsFailed', async () => {
    const result = await runInstagramPipeline(
      DATA,
      ctx(),
      deps({
        runAcquisitionImpl: vi.fn(async () => acqOk(NON_STRUCTURED_CAPTION)),
        extractWithVisionImpl: vi.fn(async () => {
          throw new Error('vision');
        }),
        extractWithTextFallbackImpl: vi.fn(async () => {
          throw new Error('text');
        }),
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('AllExtractionPathsFailed');
  });

  it('keyframes fail but vision still succeeds → no partialReason', async () => {
    const result = await runInstagramPipeline(
      DATA,
      ctx(),
      deps({
        extractKeyframesImpl: vi.fn(async () => {
          throw new Error('ffmpeg missing');
        }),
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    const keyframes = result.meta.stages['keyframes'] as { ok?: boolean };
    expect(keyframes.ok).toBe(false);
  });
});

describe('runInstagramPipeline — acquisition failures', () => {
  it('auth-dead returns partial draft with placeholder DSL', async () => {
    const result = await runInstagramPipeline(
      DATA,
      ctx(),
      deps({
        runAcquisitionImpl: vi.fn(async () => ({
          ok: false,
          kind: 'auth-dead',
          stderr: '',
        })),
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.partialReason).toBe('auth-dead');
    expect(result.dsl).toContain('ig-pending-1');
  });

  it('rate-limited propagates retryAfter to BullMQ', async () => {
    const result = await runInstagramPipeline(
      DATA,
      ctx(),
      deps({
        runAcquisitionImpl: vi.fn(async () => ({
          ok: false,
          kind: 'rate-limited',
          retryAfter: 600,
        })),
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.retryAfterSec).toBe(600);
  });
});

describe('runInstagramPipeline — cancellation', () => {
  it('returns Cancelled when the orchestrator polls before acquisition', async () => {
    const result = await runInstagramPipeline(DATA, ctx(true), deps());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('Cancelled');
  });
});

describe('runInstagramPipeline — vision payload cap', () => {
  it('passes the keyframes the orchestrator received into the vision call', async () => {
    const visionMock = visionOk(HAPPY_PARSED);
    const tenPaths = Array.from({ length: 10 }, (_, i) => `/tmp/k${i}.jpg`);
    await runInstagramPipeline(
      DATA,
      ctx(),
      deps({
        extractKeyframesImpl: ffmpegOk(tenPaths),
        extractWithVisionImpl: visionMock,
      })
    );
    expect(visionMock).toHaveBeenCalledOnce();
    const args = visionMock.mock.calls[0]?.[0];
    expect(args?.keyframePaths.length).toBe(10);
    // The orchestrator forwards every keyframe; the MAX_KEYFRAMES_TO_VISION cap
    // is enforced inside extractWithClaudeVision and asserted in its own test.
  });
});
