# PRD-130: Instagram STT + Vision Pipeline

> Epic: [02 — Ingestion Pipeline](../../epics/02-ingestion-pipeline.md)

## Overview

Continues where PRD-129 (acquisition) leaves off. Given a downloaded reel video + caption, decide whether the caption is structured-enough to skip STT, run `faster-whisper` on the audio if not, extract ffmpeg scene-detection keyframes, hand the union of caption + transcript + keyframes to Claude vision, parse the response, build a DSL, write a draft. Implements the hierarchical degradation strategy from the epic key decisions.

The most expensive and slowest path in Epic 02. Typical timing for a 60-second reel: ~30-60s for STT (CPU), ~5s for keyframes, ~5s for Claude vision, ~5s for compile = ~45-75s total.

## Pipeline

```ts
// apps/pops-worker-food/src/handlers/instagram-stt-vision.ts
export async function runInstagramIngest(
  data: IngestJobData & { kind: 'url-instagram' },
): Promise<IngestJobResult> {
  // 1. Acquire
  const acq = await runInstagramAcquisition(data);
  if (!acq.ok) {
    return convertAcquisitionFailure(acq, data.sourceId);
  }

  // 2. Caption heuristic
  const captionStructured = isStructuredCaption(acq.caption);
  let transcript: string | null = null;
  let transcriptOk = true;

  // 3. STT (conditional)
  if (!captionStructured) {
    try {
      transcript = await runFasterWhisper(acq.videoPath, acq.workDir);
    } catch (e) {
      transcriptOk = false;
      // Continue with caption-only; degrade gracefully
    }
  }

  // 4. Keyframes
  let keyframes: string[] = [];
  let keyframesOk = true;
  try {
    keyframes = await extractKeyframes(acq.videoPath, acq.workDir);
  } catch (e) {
    keyframesOk = false;
  }

  // 5. Vision extraction
  let parsed: ExtractedRecipe | null = null;
  let visionOk = true;
  try {
    parsed = await extractWithClaudeVision({
      caption: acq.caption,
      transcript,
      keyframePaths: keyframes,
      url: data.url,
    });
  } catch (e) {
    visionOk = false;
  }

  // 6. Decide degradation
  if (!parsed) {
    // Fall back to caption-only via text LLM (reuses PRD-128's prompt + helper)
    if (acq.caption && acq.caption.length > 30) {
      parsed = await extractWithClaudeText({ body: acq.caption, source: 'ig-text-fallback' });
    }
  }

  if (!parsed) {
    return { ok: false, errorCode: 'AllExtractionPathsFailed', errorMessage: 'No extraction path produced a result', meta: assembleMeta(...) };
  }

  // 7. Build DSL and hand off
  const dsl = buildDsl(parsed, { source: 'url-instagram', url: data.url });
  const partialReason = derivePartialReason({ captionStructured, transcriptOk, visionOk, keyframesOk });
  return { ok: true, dsl, meta: assembleMeta({ acq, captionStructured, transcript, keyframes, parsed, ... }), partialReason };
}
```

The worker shell then calls `food.ingest.workerComplete` (PRD-125) with this result; the mutation creates the recipe atomically and updates `ingest_sources`. Handler NEVER calls `food.recipes.create` directly.

### Recipe slug

Same convention as PRD-127 / 128: `buildDsl` slugifies `parsed.title` to kebab-case ASCII; conflict resolution via numeric suffix against `slug_registry`.

### `convertAcquisitionFailure`

Maps PRD-129's four failure variants onto `IngestJobResult`:

```ts
function convertAcquisitionFailure(
  acq: AcquisitionResult & { ok: false },
  sourceId: number
): IngestJobResult {
  const meta = {
    extractor_version: PIPELINE_VERSION,
    stages: { acquisition: { ok: false, kind: acq.kind } },
  };
  switch (acq.kind) {
    case 'auth-dead':
      // Surface to review queue as partial; cookies need refresh per runbook. NOT retried (BullMQ attempts wasted).
      return {
        ok: true,
        dsl: buildAuthDeadPlaceholderDsl(sourceId),
        meta,
        partialReason: 'auth-dead',
      };
    case 'rate-limited':
      // Hard failure with retryAfter set so BullMQ delays the next attempt.
      return {
        ok: false,
        errorCode: 'InstagramRateLimited',
        errorMessage: 'IG rate-limited; will retry',
        meta,
        retryAfterSec: acq.retryAfter,
      };
    case 'generic-failure':
      return {
        ok: false,
        errorCode: 'InstagramAcquisitionFailed',
        errorMessage: `yt-dlp exit ${acq.exitCode}: ${acq.stderr.slice(0, 200)}`,
        meta,
      };
    case 'missing-artifacts':
      return {
        ok: false,
        errorCode: 'InstagramArtifactsMissing',
        errorMessage: 'yt-dlp succeeded but expected files not present',
        meta,
      };
  }
}
```

`auth-dead` is the only acquisition failure that surfaces as `ok: true, partialReason: 'auth-dead'` — because we DO want it in the review queue (Epic 03) so the user sees the cookie-refresh prompt. The placeholder DSL is minimal: `@recipe(slug="ig-pending-<sourceId>", title="Instagram ingest pending — cookies need refresh")` + `@yield(ig-pending-<sourceId>, 1:count)`. No ingredients, no steps. Review queue dismisses or reruns after cookie refresh.

## Caption Heuristic

`isStructuredCaption(caption: string | null)` returns true when the caption looks like it already contains a recipe — skipping STT saves ~60% of pipeline time on the common case:

```ts
function isStructuredCaption(caption: string | null): boolean {
  if (!caption || caption.length < 100) return false;
  const lines = caption.split('\n');
  const hasBulletsOrNumbers = lines.filter((l) => /^[\-•*\d]/.test(l.trim())).length >= 5;
  const hasIngredientsHeader = /ingredient(s|\b)/i.test(caption);
  const hasStepsHeader = /(method|steps|directions|instructions)/i.test(caption);
  const hasMeasurementUnits = /\b(g|kg|ml|l|cup|tbsp|tsp|oz|lb)\b/i.test(caption);

  return (hasBulletsOrNumbers && hasMeasurementUnits) || (hasIngredientsHeader && hasStepsHeader);
}
```

Tuned conservatively — false negatives (running STT unnecessarily) are cheaper than false positives (missing recipe content because we skipped STT). Run the recipe through with `captionStructured=true` and you skip STT for ~70% of caption-rich reels.

## faster-whisper STT

Wraps the Python CLI:

```bash
python3 -m faster_whisper.cli \
  --model distil-large-v3 \
  --device cpu \
  --compute_type int8 \
  --output_format vtt \
  --output_dir {workDir} \
  --beam_size 5 \
  --language auto \
  {videoPath}
```

Faster-whisper detects language automatically. Output `transcript.vtt` written to workDir; PRD-130 reads it as plain text (concatenates segments).

Timeout: 120 seconds per video. If exceeded, treat as STT-failure (degradation path).

Memory: ~1.5 GB per concurrent invocation (distil-large-v3 int8). PRD-126's worker pool size 2 default means ~3 GB peak.

## Keyframe extraction

ffmpeg scene detection picks "interesting" frames:

```bash
ffmpeg -i {videoPath} \
  -vf "select='gt(scene,0.3)',scale=720:-2" \
  -vsync vfr \
  -q:v 2 \
  -frames:v 10 \
  {workDir}/keyframes/%03d.jpg
```

Threshold 0.3 picks ~5-10 frames from a typical 60s reel. Hard cap at 10 frames via `-frames:v 10`. Scale to 720p to keep frame size manageable for Claude vision.

If 0 frames extracted (very short reel, no scene changes), pull a single frame at the 2-second mark as fallback:

```bash
ffmpeg -i {videoPath} -ss 2 -frames:v 1 -q:v 2 {workDir}/keyframes/000.jpg
```

Timeout: 60 seconds.

## Claude vision extraction

One call to `claude-haiku-4-5-20251001` (or `claude-sonnet-4-6` if vision quality matters more; configurable via `FOOD_IG_VISION_MODEL`). Multimodal: text + N keyframes attached.

Prompt structure:

```
You are extracting a recipe from an Instagram reel.

The source has three components:
1. CAPTION (the post's text, often contains ingredient lists)
2. TRANSCRIPT (auto-generated from the audio; may be noisy)
3. KEYFRAMES (frames from the video; may contain on-screen text overlays with ingredients and quantities — VERY IMPORTANT, often the only place quantities appear)

CAPTION:
{caption or "(none)"}

TRANSCRIPT:
{transcript or "(skipped — caption was structured enough)"}

KEYFRAMES:
{N images attached}

Extract a recipe as JSON. Use this exact schema:

(... same schema as PRD-128 ...)

Rules:
- Read on-screen text in keyframes carefully — recipe reels often display ingredients with quantities as overlays that are NEVER spoken aloud. These overlays are the most reliable source of quantities.
- Prefer caption + on-screen text quantities over transcript quantities (transcript is noisy).
- If caption is structured (has ingredient list + steps), trust it most.
- Use metric units when available.
- If keyframes contradict caption, prefer keyframes for quantities.
- Output ONLY the JSON. No markdown, no explanation.
```

Token budget: input ~5000-10000 tokens (caption + transcript + image tokens for 5-10 keyframes), output ~500-1500. Cost on Haiku 4.5 with vision: ~$0.01-0.02 per ingest.

Image cap: ≤5 keyframes sent to vision. If extraction produced 10, send the first 5 by scene-change strength (ffmpeg writes them in order; first N are highest-scoring scenes).

Prompt as TS constant in `apps/pops-worker-food/src/prompts/ig-vision.ts`. Read-only viewer at `/food/prompts` (PRD-133).

## Degradation

`derivePartialReason()` consolidates per-stage outcomes:

| acq.ok | captionStructured | transcriptOk  | visionOk | keyframesOk | parsed | final state | partialReason                                |
| ------ | ----------------- | ------------- | -------- | ----------- | ------ | ----------- | -------------------------------------------- |
| true   | true              | n/a (skipped) | true     | true        | yes    | completed   | —                                            |
| true   | false             | true          | true     | true        | yes    | completed   | —                                            |
| true   | false             | false         | true     | true        | yes    | partial     | `stt-failed`                                 |
| true   | false             | n/a           | false    | n/a         | yes    | partial     | `vision-failed`                              |
| true   | n/a               | n/a           | false    | false       | yes    | partial     | `caption-only-fallback`                      |
| true   | n/a               | n/a           | n/a      | n/a         | no     | failed      | —                                            |
| false  | n/a               | n/a           | n/a      | n/a         | n/a    | partial     | `auth-dead` (from PRD-129)                   |
| false  | n/a               | n/a           | n/a      | n/a         | n/a    | failed      | (rate-limited / generic / missing-artifacts) |

## Meta JSON additions

```json
{
  "stages": {
    "acquisition": {
      "ok": true,
      "duration_ms": 8200,
      "video_path": "...",
      "thumbnail_path": "..."
    },
    "caption_heuristic": { "structured": false, "length": 240 },
    "stt": {
      "ok": true,
      "duration_ms": 45000,
      "model": "distil-large-v3",
      "language": "en",
      "transcript_chars": 820
    },
    "keyframes": { "ok": true, "duration_ms": 4100, "count": 7 },
    "vision": {
      "ok": true,
      "duration_ms": 5200,
      "model": "claude-haiku-4-5-20251001",
      "prompt_version": "ig-vision-v1.0",
      "keyframes_sent": 5,
      "input_tokens": 6420,
      "output_tokens": 860,
      "cost_usd": 0.014
    },
    "dsl_build": { "ok": true, "duration_ms": 18 },
    "compile": { "ok": true, "duration_ms": 110, "creations": 5, "proposedSlugs": 2 }
  }
}
```

## Business Rules

- Acquisition failure (PRD-129) is **terminal for the success path** — no degradation can recover from auth-dead / rate-limited / missing-artifacts. PRD-130 just converts these to the right `IngestJobResult` shape.
- STT failure is recoverable — caption + vision can still produce a useful draft. Marked partial.
- Vision failure with no caption is **terminal** — no useful path forward. Failed.
- Vision failure WITH caption falls through to text-LLM extraction. The fallback calls the shared `extractWithClaudeText` helper from PRD-132 with `source='ig-text-fallback'`; the helper uses PRD-132's `PROMPT_VERSION_TEXT` template (`text-v1.0`) — same JSON output schema as PRD-128's web-LLM path, but the prompt itself is the text-ingest template (permissive on input shape, no readability/page-title scaffolding). AI usage logs the call as `operation='recipe-extract-ig-text-fallback'` and `metadata.prompt_version='text-vN'`.
- Empty caption + STT skipped (heuristic false-positive) — STT runs anyway because the empty caption can't be structured. The heuristic's `caption.length < 100` check covers this.
- Concurrent invocations: each runs in its own `${FOOD_INGEST_DIR}/<sourceId>/` workdir; no shared state. Memory pressure from concurrent faster-whisper handled by `FOOD_WORKER_CONCURRENCY` (default 2).
- Cancellation checked between stages: after acquisition, after STT, after keyframes, before vision call. Mid-vision-call cancellation NOT supported.
- Cost cap: same observation-only behaviour as PRD-128.
- Video file kept on disk for the source-media retention window (PRD-110). Audit trail.

## Edge Cases

| Case                                                                  | Behaviour                                                                                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Caption heuristic says structured but caption is actually random text | Vision still runs; LLM tries to extract; may produce a bad draft. Review queue catches.                                                                      |
| Caption heuristic says unstructured but caption was actually a recipe | Pays the STT cost (~45s) unnecessarily. Acceptable trade-off; STT result confirms or corrects.                                                               |
| Video has no audio                                                    | faster-whisper produces empty transcript; treated as STT success with no content. Vision call goes ahead.                                                    |
| Video is 5 minutes long                                               | STT takes ~5 minutes; may hit `FOOD_INGEST_TIMEOUT_SEC` (default 300). Operator can raise.                                                                   |
| Audio is in a non-English language                                    | faster-whisper detects language; transcript is in source language. Claude vision handles multilingual input; output language may match source. User reviews. |
| Vision returns malformed JSON                                         | Treat as `visionOk=false`; degrade to text-LLM if caption available; else fail.                                                                              |
| Keyframes extracted 0 frames after fallback                           | Send empty keyframes array to vision; rely on caption + transcript only.                                                                                     |
| Keyframes extracted 30 frames (very dynamic video)                    | Hard cap at 10 in ffmpeg invocation; first 5 sent to vision.                                                                                                 |
| Vision API rate-limited                                               | Job fails; BullMQ retries per policy.                                                                                                                        |
| Vision response has step bodies in a non-English language             | Stored as-is. DSL renderer preserves; review queue may add a "translate" action (deferred).                                                                  |
| Workdir disk fills mid-STT (faster-whisper writes vtt incrementally)  | STT errors; transcriptOk=false; degradation path.                                                                                                            |
| Reel is removed from Instagram between submit and process             | yt-dlp errors during acquisition; PRD-129 handles.                                                                                                           |

## Acceptance Criteria

Inline per theme protocol.

### Pipeline orchestration

- [ ] `runInstagramIngest(data)` exported from `apps/pops-worker-food/src/handlers/instagram-stt-vision.ts`.
- [ ] Calls `runInstagramAcquisition` (PRD-129); converts failures appropriately.
- [ ] Caption heuristic decides STT skip per the documented logic.
- [ ] STT, keyframes, vision each wrapped in try/catch; failures route to degradation paths.
- [ ] Final `partialReason` derived from per-stage outcomes per the truth table.

### faster-whisper integration

- [ ] Python CLI invocation with documented flags.
- [ ] `distil-large-v3` model used (cached in container per PRD-126).
- [ ] Output `transcript.vtt` parsed into a plain transcript string.
- [ ] Timeout 120s; treated as STT failure on exceed.
- [ ] Vitest test: mock subprocess; assert flags + output parsing.

### ffmpeg keyframes

- [ ] Scene-detection invocation produces up to 10 frames.
- [ ] Fallback single-frame extraction at 2s if scene detection returns 0.
- [ ] Frames scaled to 720p.
- [ ] Top 5 sent to vision (when more than 5 extracted).
- [ ] Timeout 60s.

### Claude vision

- [ ] Single API call per ingest with multimodal payload (caption + transcript + ≤5 images).
- [ ] Prompt template exported from `apps/pops-worker-food/src/prompts/ig-vision.ts` with `PROMPT_VERSION_IG_VISION`.
- [ ] Model configurable via `FOOD_IG_VISION_MODEL`; default `claude-haiku-4-5-20251001`.
- [ ] Response strict-parsed as JSON; zod-validated.

### Text-LLM fallback

- [ ] When vision fails AND caption is non-trivial (>30 chars), invoke text-LLM via `extractWithClaudeText` — the shared helper exported by PRD-132. The fallback uses **PRD-132's text-ingest prompt** (`PROMPT_VERSION_TEXT`); the JSON output schema is shared with PRD-128.
- [ ] `ai_inference_log` row uses `operation='recipe-extract-ig-text-fallback'` (distinct operation enum value per PRD-133) and `metadata.prompt_version='text-vN'` — the operation distinguishes the _call context_ in observability; the prompt template is the same one PRD-132's text-ingest uses.

### Meta & logging

- [ ] Meta JSON populated with all stages per the shape above.
- [ ] `ai_inference_log` rows per LLM call (vision + text-fallback if invoked) — PRD-133.

### Tests

- [ ] Vitest unit tests at `apps/pops-worker-food/src/handlers/__tests__/instagram-stt-vision.test.ts` cover happy path + each degradation branch.
- [ ] Acquisition mocked; faster-whisper / ffmpeg / Claude vision all mocked.
- [ ] Truth-table test: each row in the degradation table verified.
- [ ] Vitest test: oversized keyframe set capped at 5 before vision call.
- [ ] Integration test (gated): real-pipeline test against a known-public reel.

## Out of Scope

- Instagram acquisition / yt-dlp / cookie management — **PRD-129**.
- AI usage logging — **PRD-133**.
- Cost-cap enforcement (hard abort) — observation only.
- GPU faster-whisper — CPU only per theme decision.
- Multilingual translation — extract in source language.
- Vision prompt iteration / A/B testing — single prompt in v1.
- Streaming vision response — full completion only.
- Per-creator prompt overrides — single prompt covers all reels.
- Audio-only path (no video, just narration) — not supported in v1.
